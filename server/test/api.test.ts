import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';

/**
 * End-to-end API tests.
 *
 * They run against a throwaway SQLite database and uploads folder so the real
 * development data is never touched. The environment is configured *before* the
 * app modules are imported, because `config.ts` reads `process.env` on import.
 */

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bongchat-test-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_FILE = path.join(tmpRoot, 'test.db');
process.env.UPLOAD_DIR = path.join(tmpRoot, 'uploads');
delete process.env.AI_PROVIDER;
delete process.env.AI_API_KEY;

const { runMigrations, db } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');
const { createSocketServer } = await import('../src/sockets/index.js');
const { io: ioClient } = await import('socket.io-client');

let server: Server;
let base = '';
let alice = '';
let bob = '';
let carol = '';
let aliceId = 0;

interface ApiResult {
  status: number;
  json: any;
  cookie?: string;
}

async function call(
  method: string,
  endpoint: string,
  options: { cookie?: string; body?: unknown } = {},
): Promise<ApiResult> {
  const res = await fetch(base + endpoint, {
    method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const setCookies = res.headers.getSetCookie();
  return {
    status: res.status,
    json,
    cookie: setCookies.length ? setCookies.map((c) => c.split(';')[0]).join('; ') : undefined,
  };
}

async function register(username: string): Promise<ApiResult> {
  return call('POST', '/api/auth/register', {
    body: { username, email: `${username}@test.dev`, password: 'password123', displayName: username },
  });
}

before(async () => {
  await runMigrations();
  const app = createApp();
  server = app.listen(0);
  createSocketServer(server);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;

  const aliceRes = await register('alice');
  const bobRes = await register('bob');
  const carolRes = await register('carol');
  assert.equal(aliceRes.status, 201, 'alice registers');
  assert.equal(bobRes.status, 201, 'bob registers');
  assert.equal(carolRes.status, 201, 'carol registers');
  alice = aliceRes.cookie!;
  bob = bobRes.cookie!;
  carol = carolRes.cookie!;
  aliceId = aliceRes.json.user.id;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.destroy();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test('health check is public', async () => {
  const res = await call('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.json.ok, true);
});

test('unknown API routes return a JSON 404', async () => {
  const res = await call('GET', '/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.ok(res.json.error);
});

test('protected endpoints reject anonymous requests', async () => {
  const res = await call('GET', '/api/notifications');
  assert.equal(res.status, 401);
});

test('/auth/me reports a null user when anonymous', async () => {
  const res = await call('GET', '/api/auth/me');
  assert.equal(res.status, 200);
  assert.equal(res.json.user, null);
});

test('register sets a session and /auth/me returns the user', async () => {
  const res = await call('GET', '/api/auth/me', { cookie: alice });
  assert.equal(res.status, 200);
  assert.equal(res.json.user.username, 'alice');
});

test('login rejects a wrong password and accepts the right one', async () => {
  const bad = await call('POST', '/api/auth/login', {
    body: { identifier: 'alice', password: 'nope-wrong' },
  });
  assert.equal(bad.status, 401);

  const good = await call('POST', '/api/auth/login', {
    body: { identifier: 'alice', password: 'password123' },
  });
  assert.equal(good.status, 200);
  assert.ok(good.cookie);
});

test('duplicate registration is rejected', async () => {
  const res = await register('alice');
  assert.equal(res.status, 409);
});

let postId = 0;

test('create, read and like a post', async () => {
  const created = await call('POST', '/api/posts', {
    cookie: alice,
    body: { content: 'Hello from the test suite #testing' },
  });
  assert.equal(created.status, 201);
  postId = created.json.post.id;

  const feed = await call('GET', '/api/posts', { cookie: alice });
  assert.equal(feed.status, 200);
  assert.ok(feed.json.items.some((item: any) => item.post?.id === postId));

  const liked = await call('POST', `/api/posts/${postId}/like`, { cookie: bob });
  assert.equal(liked.status, 200);
  assert.equal(liked.json.likedByMe, true);
  assert.equal(liked.json.likes, 1);

  const unliked = await call('POST', `/api/posts/${postId}/like`, { cookie: bob });
  assert.equal(unliked.json.likedByMe, false);
  assert.equal(unliked.json.likes, 0);
});

test('post authors expose the real user id, not the post id', async () => {
  // Push the post ids past the user ids so a coincidence can't hide the bug.
  await call('POST', '/api/posts', { cookie: alice, body: { content: 'filler one' } });
  await call('POST', '/api/posts', { cookie: alice, body: { content: 'filler two' } });

  const created = await call('POST', '/api/posts', {
    cookie: alice,
    body: { content: 'author id check' },
  });
  assert.equal(created.status, 201);
  assert.notEqual(created.json.post.id, aliceId, 'precondition: post id differs from user id');
  assert.equal(created.json.post.author.id, aliceId);

  const single = await call('GET', `/api/posts/${created.json.post.id}`, { cookie: alice });
  assert.equal(single.json.post.author.id, aliceId);

  const feed = await call('GET', '/api/posts', { cookie: alice });
  const mine = feed.json.items.find((item: any) => item.post?.id === created.json.post.id);
  assert.ok(mine, 'the post appears in the feed');
  assert.equal(mine.post.author.id, aliceId);
});

test('a post can carry a video instead of a photo', async () => {
  const created = await call('POST', '/api/posts', {
    cookie: alice,
    body: { content: 'Video post', videoUrl: '/uploads/demo.mp4' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.post.videoUrl, '/uploads/demo.mp4');
  assert.equal(created.json.post.imageUrl, '', 'a video post has no photo');

  const single = await call('GET', `/api/posts/${created.json.post.id}`, { cookie: alice });
  assert.equal(single.json.post.videoUrl, '/uploads/demo.mp4');

  const feed = await call('GET', '/api/posts', { cookie: alice });
  const mine = feed.json.items.find((item: any) => item.post?.id === created.json.post.id);
  assert.ok(mine, 'the video post appears in the feed');
  assert.equal(mine.post.videoUrl, '/uploads/demo.mp4');
});

test('a post requires content, a photo or a video', async () => {
  const res = await call('POST', '/api/posts', {
    cookie: alice,
    body: { content: '', imageUrl: '', videoUrl: '' },
  });
  assert.equal(res.status, 400);
});

test('a post with both a photo and a video keeps only the video', async () => {
  const created = await call('POST', '/api/posts', {
    cookie: alice,
    body: { content: 'Both', imageUrl: '/uploads/pic.jpg', videoUrl: '/uploads/clip.mp4' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.post.videoUrl, '/uploads/clip.mp4');
  assert.equal(created.json.post.imageUrl, '', 'the photo is dropped when a video is present');
});

test('profile posts are paginated without gaps or duplicates', async () => {
  const pagerRes = await register('pager');
  assert.equal(pagerRes.status, 201);
  const pager = pagerRes.cookie!;

  for (let i = 1; i <= 12; i += 1) {
    const created = await call('POST', '/api/posts', {
      cookie: pager,
      body: { content: `Paged post ${i}` },
    });
    assert.equal(created.status, 201);
  }

  const first = await call('GET', '/api/posts?username=pager&page=0', { cookie: pager });
  assert.equal(first.status, 200);
  assert.equal(first.json.items.length, 10, 'the first page holds 10 posts');
  assert.equal(first.json.hasMore, true);

  const second = await call('GET', '/api/posts?username=pager&page=1', { cookie: pager });
  assert.equal(second.status, 200);
  assert.equal(second.json.items.length, 2, 'the second page holds the remainder');
  assert.equal(second.json.hasMore, false);

  const ids = [...first.json.items, ...second.json.items].map((i: any) => i.post.id);
  assert.equal(new Set(ids).size, 12, 'every post appears exactly once across pages');
});

test('comments can be created and deleted', async () => {
  const created = await call('POST', `/api/posts/${postId}/comments`, {
    cookie: bob,
    body: { content: 'Nice post!' },
  });
  assert.equal(created.status, 201);
  const commentId = created.json.comment.id;

  const list = await call('GET', `/api/posts/${postId}/comments`, { cookie: alice });
  assert.ok(list.json.comments.some((c: any) => c.id === commentId));

  const deleted = await call('DELETE', `/api/posts/${postId}/comments/${commentId}`, { cookie: bob });
  assert.equal(deleted.status, 200);

  const after = await call('GET', `/api/posts/${postId}/comments`, { cookie: alice });
  assert.equal(after.json.comments.filter((c: any) => c.id === commentId).length, 0);
});

test('a user cannot delete someone else’s comment', async () => {
  const created = await call('POST', `/api/posts/${postId}/comments`, {
    cookie: bob,
    body: { content: 'Keep me' },
  });
  const commentId = created.json.comment.id;
  // carol is neither the comment author nor the post owner, so this must fail.
  const forbidden = await call('DELETE', `/api/posts/${postId}/comments/${commentId}`, { cookie: carol });
  assert.equal(forbidden.status, 403);

  // The author (bob) can still delete it.
  const allowed = await call('DELETE', `/api/posts/${postId}/comments/${commentId}`, { cookie: bob });
  assert.equal(allowed.status, 200);
});

test('follow, then block and unblock', async () => {
  const followed = await call('POST', '/api/users/bob/follow', { cookie: alice });
  assert.equal(followed.status, 200);
  assert.equal(followed.json.following, true);

  const profile = await call('GET', '/api/users/bob', { cookie: alice });
  assert.equal(profile.status, 200);
  assert.equal(profile.json.viewer.isFollowing, true);

  const blocked = await call('POST', '/api/users/bob/block', { cookie: alice });
  assert.equal(blocked.json.blocked, true);
  const hidden = await call('GET', '/api/users/bob', { cookie: alice });
  assert.equal(hidden.status, 403);

  const unblocked = await call('POST', '/api/users/bob/block', { cookie: alice });
  assert.equal(unblocked.json.blocked, false);
  const visible = await call('GET', '/api/users/bob', { cookie: alice });
  assert.equal(visible.status, 200);
});

test('a block hides the profile in both directions', async () => {
  const jackRes = await register('jack');
  assert.equal(jackRes.status, 201);
  const kateRes = await register('kate');
  assert.equal(kateRes.status, 201);

  // Kate blocks Jack; Jack must no longer see Kate, and Kate cannot see Jack either.
  const blocked = await call('POST', '/api/users/jack/block', { cookie: kateRes.cookie! });
  assert.equal(blocked.json.blocked, true);

  const jackSeesKate = await call('GET', '/api/users/kate', { cookie: jackRes.cookie! });
  assert.equal(jackSeesKate.status, 403, 'the blocked user cannot open the blocker profile');

  const kateSeesJack = await call('GET', '/api/users/jack', { cookie: kateRes.cookie! });
  assert.equal(kateSeesJack.status, 403, 'the blocker cannot open the blocked profile');

  // Anonymous visitors still see the public profile.
  const anonymous = await call('GET', '/api/users/kate');
  assert.equal(anonymous.status, 200);
});

test('settings round-trip', async () => {
  const initial = await call('GET', '/api/settings', { cookie: alice });
  const original = initial.json.settings;

  const updated = await call('PUT', '/api/settings', {
    cookie: alice,
    body: { theme: 'dark', language: 'fr', isPrivate: true, notificationPrefs: { likes: false } },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.settings.theme, 'dark');
  assert.equal(updated.json.settings.language, 'fr');
  assert.equal(updated.json.settings.isPrivate, true);
  assert.equal(updated.json.settings.notificationPrefs.likes, false);

  const restored = await call('PUT', '/api/settings', {
    cookie: alice,
    body: {
      theme: original.theme,
      language: original.language,
      isPrivate: original.isPrivate,
      notificationPrefs: original.notificationPrefs,
    },
  });
  assert.equal(restored.json.settings.theme, original.theme);
});

test('change password and sign in with the new one', async () => {
  const changed = await call('POST', '/api/auth/change-password', {
    cookie: alice,
    body: { currentPassword: 'password123', newPassword: 'newpass123' },
  });
  assert.equal(changed.status, 200);

  const withNew = await call('POST', '/api/auth/login', {
    body: { identifier: 'alice', password: 'newpass123' },
  });
  assert.equal(withNew.status, 200);

  const restored = await call('POST', '/api/auth/change-password', {
    cookie: alice,
    body: { currentPassword: 'newpass123', newPassword: 'password123' },
  });
  assert.equal(restored.status, 200);

  const withOld = await call('POST', '/api/auth/login', {
    body: { identifier: 'alice', password: 'password123' },
  });
  assert.equal(withOld.status, 200);
});

test('change password rejects a wrong current password', async () => {
  const res = await call('POST', '/api/auth/change-password', {
    cookie: alice,
    body: { currentPassword: 'definitely-wrong', newPassword: 'whatever123' },
  });
  assert.equal(res.status, 400);
});

test('messages expose clickable link parts', async () => {
  const started = await call('POST', '/api/messages/conversations', {
    cookie: alice,
    body: { username: 'carol' },
  });
  const conversationId = started.json.conversationId;

  const sent = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
    cookie: alice,
    body: { content: 'Read this: https://example.com/post and www.bongchat.dev too' },
  });
  assert.equal(sent.status, 201);

  const links = sent.json.message.parts.filter((p: any) => p.type === 'link').map((p: any) => p.value);
  assert.deepEqual(links, ['https://example.com/post', 'www.bongchat.dev']);

  // The stored history carries the same segments, so links stay clickable after reload.
  const history = await call('GET', `/api/messages/conversations/${conversationId}/messages`, {
    cookie: alice,
  });
  const stored = history.json.messages.find((m: any) => m.content.includes('example.com'));
  assert.deepEqual(
    stored.parts.filter((p: any) => p.type === 'link').map((p: any) => p.value),
    ['https://example.com/post', 'www.bongchat.dev'],
  );
});

test('start a conversation and exchange a message', async () => {
  const started = await call('POST', '/api/messages/conversations', {
    cookie: alice,
    body: { username: 'bob' },
  });
  assert.equal(started.status, 201);
  const conversationId = started.json.conversationId;

  const sent = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
    cookie: alice,
    body: { content: 'Hey Bob!' },
  });
  assert.equal(sent.status, 201);
  assert.equal(sent.json.message.content, 'Hey Bob!');

  const history = await call('GET', `/api/messages/conversations/${conversationId}/messages`, {
    cookie: bob,
  });
  assert.equal(history.status, 200);
  assert.ok(history.json.messages.some((m: any) => m.content === 'Hey Bob!'));

  const empty = await call('POST', `/api/messages/conversations/${conversationId}/messages`, {
    cookie: alice,
    body: { content: '' },
  });
  assert.equal(empty.status, 400);
});

test('stories can be created, listed and deleted', async () => {
  const created = await call('POST', '/api/stories', {
    cookie: alice,
    body: { content: 'Testing stories', imageUrl: '', style: 'ocean' },
  });
  assert.equal(created.status, 201);
  const storyId = created.json.story.id;

  const rail = await call('GET', '/api/stories', { cookie: alice });
  assert.equal(rail.status, 200);
  assert.ok(rail.json.groups.some((g: any) => g.user.id === aliceId));

  const deleted = await call('DELETE', `/api/stories/${storyId}`, { cookie: alice });
  assert.equal(deleted.status, 200);
});

test('a story requires content, an image or a video', async () => {
  const res = await call('POST', '/api/stories', {
    cookie: alice,
    body: { content: '', imageUrl: '', videoUrl: '', style: 'ocean' },
  });
  assert.equal(res.status, 400);
});

test('a story can carry a video instead of an image', async () => {
  const created = await call('POST', '/api/stories', {
    cookie: alice,
    body: { content: 'Video story', videoUrl: '/uploads/demo.mp4', style: 'sunset' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.story.videoUrl, '/uploads/demo.mp4');
  assert.equal(created.json.story.imageUrl, '');
  // The author id must be the creator's user id, not the story id.
  const me = await call('GET', '/api/auth/me', { cookie: alice });
  assert.equal(created.json.story.author.id, me.json.user.id);

  const rail = await call('GET', '/api/stories', { cookie: alice });
  const mine = rail.json.groups.find((g: any) => g.user.id === created.json.story.author.id);
  assert.ok(mine);
  assert.ok(mine.stories.some((s: any) => s.videoUrl === '/uploads/demo.mp4'));

  const deleted = await call('DELETE', `/api/stories/${created.json.story.id}`, { cookie: alice });
  assert.equal(deleted.status, 200);
});

test('replying to a story creates a DM with the story attached', async () => {
  const created = await call('POST', '/api/stories', {
    cookie: alice,
    body: { content: 'Reply target', imageUrl: '/uploads/reply.jpg', style: 'aurora' },
  });
  assert.equal(created.status, 201);
  const storyId = created.json.story.id;

  const replied = await call('POST', `/api/stories/${storyId}/reply`, {
    cookie: bob,
    body: { content: 'Love this!' },
  });
  assert.equal(replied.status, 201);
  assert.ok(replied.json.conversationId, 'a conversation is opened');
  assert.equal(replied.json.message.content, 'Love this!');
  assert.equal(replied.json.message.story.id, storyId);
  assert.equal(replied.json.message.story.authorUsername, 'alice');
  assert.equal(replied.json.message.story.imageUrl, '/uploads/reply.jpg');

  // The author sees the reply as the latest message in their thread.
  const conversations = await call('GET', '/api/messages/conversations', { cookie: alice });
  const thread = conversations.json.conversations.find(
    (c: any) => c.id === replied.json.conversationId,
  );
  assert.ok(thread, 'the conversation is listed for the author');
  assert.equal(thread.lastMessage.content, 'Love this!');
  assert.equal(thread.lastMessage.story.id, storyId);

  // ...and gets a message notification that mentions the story.
  const notifications = await call('GET', '/api/notifications', { cookie: alice });
  assert.ok(
    notifications.json.notifications.some(
      (n: any) => n.type === 'message' && String(n.data?.preview).toLowerCase().includes('story'),
    ),
    'the author is notified about the story reply',
  );

  // Reusing the thread: a second reply must not create another conversation.
  const repliedAgain = await call('POST', `/api/stories/${storyId}/reply`, {
    cookie: bob,
    body: { content: 'Again' },
  });
  assert.equal(repliedAgain.json.conversationId, replied.json.conversationId);

  // The snapshot keeps the reply readable after the story is gone.
  await call('DELETE', `/api/stories/${storyId}`, { cookie: alice });
  const history = await call('GET', `/api/messages/conversations/${replied.json.conversationId}/messages`, {
    cookie: alice,
  });
  const replyMessage = history.json.messages.find((m: any) => m.content === 'Love this!');
  assert.ok(replyMessage, 'the reply survives story deletion');
  assert.equal(replyMessage.story.id, storyId, 'the story snapshot is preserved');
});

test('a story reply is rejected for your own story and for hidden stories', async () => {
  const own = await call('POST', '/api/stories', {
    cookie: alice,
    body: { content: 'Mine', style: 'candy' },
  });
  const ownReply = await call('POST', `/api/stories/${own.json.story.id}/reply`, {
    cookie: alice,
    body: { content: 'Talking to myself' },
  });
  assert.equal(ownReply.status, 400);
  await call('DELETE', `/api/stories/${own.json.story.id}`, { cookie: alice });

  // A private author's story cannot be replied to until the request is approved.
  const ninaRes = await register('nina');
  assert.equal(ninaRes.status, 201);
  const nina = ninaRes.cookie!;
  await call('PUT', '/api/settings', { cookie: nina, body: { isPrivate: true } });
  const privateStory = await call('POST', '/api/stories', {
    cookie: nina,
    body: { content: 'Private story', style: 'grape' },
  });
  const denied = await call('POST', `/api/stories/${privateStory.json.story.id}/reply`, {
    cookie: carol,
    body: { content: 'Let me in' },
  });
  assert.equal(denied.status, 403);
  await call('DELETE', `/api/stories/${privateStory.json.story.id}`, { cookie: nina });
});

test('the author does not count as a viewer of their own story', async () => {
  const created = await call('POST', '/api/stories', {
    cookie: alice,
    body: { content: 'Self view', style: 'ocean' },
  });
  const storyId = created.json.story.id;
  await call('POST', `/api/stories/${storyId}/view`, { cookie: alice });
  const single = await call('GET', `/api/stories/${storyId}`, { cookie: alice });
  assert.equal(single.json.viewers.length, 0, 'author is not in the viewer list');
  await call('DELETE', `/api/stories/${storyId}`, { cookie: alice });
});

test('notifications are listed and can be cleared', async () => {
  const list = await call('GET', '/api/notifications', { cookie: bob });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.json.notifications));

  const cleared = await call('DELETE', '/api/notifications', { cookie: bob });
  assert.equal(cleared.status, 200);
  const after = await call('GET', '/api/notifications', { cookie: bob });
  assert.equal(after.json.notifications.length, 0);
});

test('search returns a well-formed result', async () => {
  const res = await call('GET', '/api/search?q=Hello', { cookie: alice });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.json.users));
  assert.ok(Array.isArray(res.json.posts));
  assert.ok(Array.isArray(res.json.tags));
  assert.ok(Array.isArray(res.json.web));
  assert.ok(res.json.posts.some((p: any) => p.id === postId));
});

test('search supports a type filter', async () => {
  const res = await call('GET', '/api/search?q=Hello&type=users', { cookie: alice });
  assert.equal(res.status, 200);
  assert.equal(res.json.posts.length, 0);
});

test('search exposes video posts with their videoUrl', async () => {
  const created = await call('POST', '/api/posts', {
    cookie: alice,
    body: { content: 'searchable clip zzvideo', videoUrl: '/uploads/search-clip.mp4' },
  });
  assert.equal(created.status, 201);

  const res = await call('GET', '/api/search?q=zzvideo', { cookie: alice });
  assert.equal(res.status, 200);
  const hit = res.json.posts.find((p: any) => p.id === created.json.post.id);
  assert.ok(hit, 'the video post is found by search');
  assert.equal(hit.videoUrl, '/uploads/search-clip.mp4');
  assert.equal(hit.imageUrl, '');
});

test('integrations are public', async () => {
  const res = await call('GET', '/api/integrations');
  assert.equal(res.status, 200);
  assert.equal(res.json.platforms.length, 3);
});

test('a user cannot follow or block themselves', async () => {
  const follow = await call('POST', '/api/users/alice/follow', { cookie: alice });
  assert.ok(follow.status >= 400);
});

test('settings require authentication', async () => {
  const res = await call('GET', '/api/settings');
  assert.equal(res.status, 401);
});

test('profile update round-trip', async () => {
  const initial = await call('GET', '/api/users/me', { cookie: bob });
  const original = initial.json.user;

  const updated = await call('PUT', '/api/users/me', {
    cookie: bob,
    body: { displayName: 'Bobby', bio: 'Hello there' },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.user.displayName, 'Bobby');
  assert.equal(updated.json.user.bio, 'Hello there');

  const restored = await call('PUT', '/api/users/me', {
    cookie: bob,
    body: { displayName: original.displayName, bio: original.bio },
  });
  assert.equal(restored.json.user.displayName, original.displayName);
});

test('share and view counters', async () => {
  const shared = await call('POST', `/api/posts/${postId}/share`, {
    cookie: bob,
    body: { note: 'nice' },
  });
  assert.equal(shared.status, 200);
  assert.equal(shared.json.sharedByMe, true);
  assert.equal(shared.json.shares, 1);

  const unshared = await call('POST', `/api/posts/${postId}/share`, { cookie: bob, body: {} });
  assert.equal(unshared.json.sharedByMe, false);
  assert.equal(unshared.json.shares, 0);

  const firstView = await call('POST', `/api/posts/${postId}/view`, { cookie: bob });
  assert.equal(firstView.status, 200);
  assert.equal(firstView.json.views, 1);
  // A view is recorded once per viewer.
  const secondView = await call('POST', `/api/posts/${postId}/view`, { cookie: bob });
  assert.equal(secondView.json.views, 1);
});

test('only the author can delete a post', async () => {
  const created = await call('POST', '/api/posts', {
    cookie: alice,
    body: { content: 'delete me' },
  });
  const id = created.json.post.id;

  const forbidden = await call('DELETE', `/api/posts/${id}`, { cookie: bob });
  assert.equal(forbidden.status, 403);

  const removed = await call('DELETE', `/api/posts/${id}`, { cookie: alice });
  assert.equal(removed.status, 200);

  const missing = await call('GET', `/api/posts/${id}`, { cookie: alice });
  assert.equal(missing.status, 404);
});

test('followers and following lists', async () => {
  await call('POST', '/api/users/bob/follow', { cookie: alice });

  const followers = await call('GET', '/api/users/bob/followers', { cookie: alice });
  assert.equal(followers.status, 200);
  assert.ok(followers.json.users.some((u: any) => u.username === 'alice'));

  const following = await call('GET', '/api/users/alice/following', { cookie: alice });
  assert.equal(following.status, 200);
  assert.ok(following.json.users.some((u: any) => u.username === 'bob'));

  await call('POST', '/api/users/bob/follow', { cookie: alice }); // unfollow again
});

test('blocked users disappear from suggestions', async () => {
  const suggestions = await call('GET', '/api/users/suggestions', { cookie: carol });
  assert.equal(suggestions.status, 200);
  assert.ok(Array.isArray(suggestions.json.users));

  await call('POST', '/api/users/alice/block', { cookie: carol });
  const blocked = await call('GET', '/api/users/blocked', { cookie: carol });
  assert.ok(blocked.json.users.some((u: any) => u.username === 'alice'));

  const afterBlock = await call('GET', '/api/users/suggestions', { cookie: carol });
  assert.ok(!afterBlock.json.users.some((u: any) => u.username === 'alice'));

  await call('POST', '/api/users/alice/block', { cookie: carol }); // unblock
});

test('notifications can be marked read individually and in bulk', async () => {
  const created = await call('POST', `/api/posts/${postId}/comments`, {
    cookie: bob,
    body: { content: 'ping' },
  });
  const commentId = created.json.comment.id;

  const list = await call('GET', '/api/notifications', { cookie: alice });
  assert.ok(list.json.unreadCount >= 1);
  const unread = list.json.notifications.find((n: any) => !n.read);
  assert.ok(unread, 'expected an unread notification');

  const marked = await call('POST', `/api/notifications/${unread.id}/read`, { cookie: alice });
  assert.equal(marked.status, 200);
  const afterOne = await call('GET', '/api/notifications', { cookie: alice });
  assert.equal(afterOne.json.notifications.find((n: any) => n.id === unread.id).read, true);

  const readAll = await call('POST', '/api/notifications/read-all', { cookie: alice });
  assert.equal(readAll.status, 200);
  const afterAll = await call('GET', '/api/notifications', { cookie: alice });
  assert.equal(afterAll.json.unreadCount, 0);

  await call('DELETE', `/api/posts/${postId}/comments/${commentId}`, { cookie: bob });
});

test('conversation list and read receipts', async () => {
  const started = await call('POST', '/api/messages/conversations', {
    cookie: alice,
    body: { username: 'bob' },
  });
  const conversationId = started.json.conversationId;

  const list = await call('GET', '/api/messages/conversations', { cookie: bob });
  assert.equal(list.status, 200);
  const conversation = list.json.conversations.find((c: any) => c.id === conversationId);
  assert.ok(conversation, 'conversation should be listed');
  assert.equal(conversation.user.username, 'alice');
  assert.equal(conversation.user.id, aliceId, 'the counterpart exposes a real user id');
  assert.ok(conversation.unreadCount >= 1, 'alice’s message should be unread');

  const read = await call('POST', `/api/messages/conversations/${conversationId}/read`, {
    cookie: bob,
  });
  assert.equal(read.status, 200);

  const listAgain = await call('GET', '/api/messages/conversations', { cookie: bob });
  assert.equal(
    listAgain.json.conversations.find((c: any) => c.id === conversationId).unreadCount,
    0,
  );
});

test('typing indicators relay to the other participant and retract on disconnect', async () => {
  // Reuse (or create) the alice → bob conversation.
  const started = await call('POST', '/api/messages/conversations', {
    cookie: alice,
    body: { username: 'bob' },
  });
  const conversationId = started.json.conversationId;
  const bobRes = await call('GET', '/api/auth/me', { cookie: bob });
  const bobId = bobRes.json.user.id;

  const connect = (cookie: string) =>
    new Promise<any>((resolve, reject) => {
      const socket = ioClient(base, {
        withCredentials: true,
        extraHeaders: { cookie },
        transports: ['websocket'],
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const socketA = await connect(alice);
  const socketB = await connect(bob);
  const seen: Array<[string, any]> = [];
  socketB.on('typing', (p: any) => seen.push(['typing', p]));
  socketB.on('stop-typing', (p: any) => seen.push(['stop-typing', p]));
  await wait(150);

  socketA.emit('typing', { to: bobId, conversationId });
  await wait(200);
  socketA.emit('stop-typing', { to: bobId, conversationId });
  await wait(200);
  // Now type again and vanish mid-sentence — bob must still see the dots clear.
  socketA.emit('typing', { to: bobId, conversationId });
  await wait(100);
  socketA.disconnect();
  await wait(300);

  socketB.disconnect();

  const typing = seen.filter(([event]) => event === 'typing');
  const disconnectStops = seen.filter(([event, p]) => event === 'stop-typing' && p.userId === aliceId);
  assert.equal(typing.length, 2, 'two typing events reach bob');
  assert.ok(
    typing.every(([, p]) => p.conversationId === conversationId && p.userId === aliceId),
    'typing payload identifies the conversation and sender',
  );
  assert.ok(disconnectStops.length >= 2, 'a disconnect retracts the pending typing indicator');
});

test('image uploads require auth and accept a PNG', async () => {
  const anonymous = await fetch(`${base}/api/uploads`, { method: 'POST' });
  assert.equal(anonymous.status, 401);

  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const form = new FormData();
  form.append('file', new Blob([pngHeader], { type: 'image/png' }), 'tiny.png');

  const uploaded = await fetch(`${base}/api/uploads`, {
    method: 'POST',
    headers: { cookie: alice },
    body: form,
  });
  assert.equal(uploaded.status, 201);
  const body = await uploaded.json();
  assert.match(body.url, /^\/uploads\//);

  const served = await fetch(base + body.url);
  assert.equal(served.status, 200);
});

test('the video upload endpoint accepts video and rejects images', async () => {
  const video = new FormData();
  video.append('file', new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' }), 'clip.mp4');
  const uploaded = await fetch(base + '/api/uploads/video', {
    method: 'POST',
    headers: { cookie: alice },
    body: video,
  });
  assert.equal(uploaded.status, 201);
  const body = await uploaded.json();
  assert.equal(body.kind, 'video');
  assert.match(body.url, /\.mp4$/);

  const image = new FormData();
  image.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'pic.png');
  const rejected = await fetch(base + '/api/uploads/video', {
    method: 'POST',
    headers: { cookie: alice },
    body: image,
  });
  assert.equal(rejected.status, 400);
});

test('private accounts hide content from non-followers', async () => {
  const initial = await call('GET', '/api/settings', { cookie: bob });
  const original = initial.json.settings;

  const madePrivate = await call('PUT', '/api/settings', {
    cookie: bob,
    body: { isPrivate: true },
  });
  assert.equal(madePrivate.json.settings.isPrivate, true);

  const hidden = await call('GET', '/api/users/bob/followers', { cookie: carol });
  assert.equal(hidden.status, 403);

  const restored = await call('PUT', '/api/settings', {
    cookie: bob,
    body: { isPrivate: original.isPrivate },
  });
  assert.equal(restored.json.settings.isPrivate, original.isPrivate);
});

test('reposts never expose posts from accounts the viewer cannot see', async () => {
  const daveRes = await register('dave');
  assert.equal(daveRes.status, 201);
  const dave = daveRes.cookie!;

  // Dave goes private.
  await call('PUT', '/api/settings', { cookie: dave, body: { isPrivate: true } });

  const created = await call('POST', '/api/posts', {
    cookie: dave,
    body: { content: 'private thoughts' },
  });
  assert.equal(created.status, 201);
  const postId = created.json.post.id;

  // Bob requests to follow Dave; Dave approves, so Bob can see the private post.
  await call('POST', '/api/users/dave/follow', { cookie: bob });
  const approved = await call('POST', '/api/users/requests/bob/accept', { cookie: dave });
  assert.equal(approved.status, 200);
  const shared = await call('POST', `/api/posts/${postId}/share`, {
    cookie: bob,
    body: { note: '' },
  });
  assert.equal(shared.status, 200);
  assert.equal(shared.json.sharedByMe, true);

  // Carol follows Bob but not Dave — the repost must not leak Dave's post.
  await call('POST', '/api/users/bob/follow', { cookie: carol });
  const carolFeed = await call('GET', '/api/posts', { cookie: carol });
  assert.equal(carolFeed.status, 200);
  assert.ok(
    !carolFeed.json.items.some((item: any) => item.post?.id === postId),
    'a private post must not appear through a repost',
  );

  // Bob does see it, because he follows Dave.
  const bobFeed = await call('GET', '/api/posts', { cookie: bob });
  assert.ok(
    bobFeed.json.items.some((item: any) => item.kind === 'share' && item.post.id === postId),
    'the follower who reposted it still sees it',
  );

  // Once Dave is public the repost reaches Carol too.
  await call('PUT', '/api/settings', { cookie: dave, body: { isPrivate: false } });
  const publicFeed = await call('GET', '/api/posts', { cookie: carol });
  assert.ok(
    publicFeed.json.items.some((item: any) => item.kind === 'share' && item.post.id === postId),
    'a public repost is visible to everyone who follows the sharer',
  );
});

test('following a private account sends a request until approved', async () => {
  const erinRes = await register('erin');
  assert.equal(erinRes.status, 201);
  const erin = erinRes.cookie!;

  await call('PUT', '/api/settings', { cookie: erin, body: { isPrivate: true } });
  const created = await call('POST', '/api/posts', {
    cookie: erin,
    body: { content: 'erin secret' },
  });
  assert.equal(created.status, 201);
  const postId = created.json.post.id;

  // Carol asks to follow: this is a request, not a follow.
  const requested = await call('POST', '/api/users/erin/follow', { cookie: carol });
  assert.equal(requested.status, 200);
  assert.equal(requested.json.following, false, 'a private follow is not live yet');
  assert.equal(requested.json.requested, true);

  const profile = await call('GET', '/api/users/erin', { cookie: carol });
  assert.equal(profile.json.viewer.isRequested, true);
  assert.equal(profile.json.viewer.isFollowing, false);
  assert.equal(profile.json.viewer.canViewContent, false);
  assert.equal(profile.json.stats.posts, 0, 'a private account hides its post count');

  const hiddenFeed = await call('GET', '/api/posts?username=erin', { cookie: carol });
  assert.equal(hiddenFeed.status, 403, 'a pending request grants no content access');

  // A pending requester must not appear as a follower yet.
  const followersBefore = await call('GET', '/api/users/erin/followers', { cookie: erin });
  assert.ok(
    !followersBefore.json.users.some((u: any) => u.username === 'carol'),
    'pending requests are not followers',
  );

  // Erin sees the waiting request.
  const inbox = await call('GET', '/api/users/requests', { cookie: erin });
  assert.equal(inbox.status, 200);
  assert.ok(inbox.json.requests.some((r: any) => r.user.username === 'carol'));

  // Approving grants access and notifies the requester.
  const accepted = await call('POST', '/api/users/requests/carol/accept', { cookie: erin });
  assert.equal(accepted.status, 200);
  const profileAfter = await call('GET', '/api/users/erin', { cookie: carol });
  assert.equal(profileAfter.json.viewer.isFollowing, true);
  assert.equal(profileAfter.json.viewer.isRequested, false);
  assert.equal(profileAfter.json.viewer.canViewContent, true);

  const visibleFeed = await call('GET', '/api/posts?username=erin', { cookie: carol });
  assert.equal(visibleFeed.status, 200);
  assert.ok(visibleFeed.json.items.some((i: any) => i.post?.id === postId));

  const followersAfter = await call('GET', '/api/users/erin/followers', { cookie: erin });
  assert.ok(
    followersAfter.json.users.some((u: any) => u.username === 'carol'),
    'an approved requester becomes a follower',
  );

  const carolNotifications = await call('GET', '/api/notifications', { cookie: carol });
  assert.ok(
    carolNotifications.json.notifications.some((n: any) => n.type === 'follow_accepted'),
    'the requester is told their request was approved',
  );

  // Unfollowing a private account revokes access again.
  const unfollow = await call('POST', '/api/users/erin/follow', { cookie: carol });
  assert.equal(unfollow.json.following, false);
  const profileFinal = await call('GET', '/api/users/erin', { cookie: carol });
  assert.equal(profileFinal.json.viewer.canViewContent, false);
});

test('a rejected follow request grants no access', async () => {
  const fionaRes = await register('fiona');
  assert.equal(fionaRes.status, 201);
  const fiona = fionaRes.cookie!;
  await call('PUT', '/api/settings', { cookie: fiona, body: { isPrivate: true } });

  await call('POST', '/api/users/fiona/follow', { cookie: carol });
  const rejected = await call('POST', '/api/users/requests/carol/reject', { cookie: fiona });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.json.rejected, true);

  // The request is gone, so nothing is pending and nothing is visible.
  const inbox = await call('GET', '/api/users/requests', { cookie: fiona });
  assert.equal(inbox.json.requests.length, 0);

  const profile = await call('GET', '/api/users/fiona', { cookie: carol });
  assert.equal(profile.json.viewer.isRequested, false);
  assert.equal(profile.json.viewer.canViewContent, false);
});

test('going public approves any pending follow request', async () => {
  const hanaRes = await register('hana');
  assert.equal(hanaRes.status, 201);
  const hana = hanaRes.cookie!;
  await call('PUT', '/api/settings', { cookie: hana, body: { isPrivate: true } });

  const requested = await call('POST', '/api/users/hana/follow', { cookie: carol });
  assert.equal(requested.json.requested, true);

  // Switching to public promotes the waiting request to a real follow.
  await call('PUT', '/api/settings', { cookie: hana, body: { isPrivate: false } });
  const profile = await call('GET', '/api/users/hana', { cookie: carol });
  assert.equal(profile.json.viewer.isFollowing, true);
  assert.equal(profile.json.viewer.isRequested, false);
  assert.equal(profile.json.viewer.canViewContent, true);
});

test('a private account cannot have its request approved by anyone but its owner', async () => {
  const ginaRes = await register('gina');
  assert.equal(ginaRes.status, 201);
  const gina = ginaRes.cookie!;
  await call('PUT', '/api/settings', { cookie: gina, body: { isPrivate: true } });

  await call('POST', '/api/users/gina/follow', { cookie: carol });
  // Bob is not the owner of the request, so there is nothing of his to approve.
  const attempt = await call('POST', '/api/users/requests/carol/accept', { cookie: bob });
  assert.equal(attempt.status, 404);

  const profile = await call('GET', '/api/users/gina', { cookie: carol });
  assert.equal(profile.json.viewer.canViewContent, false, 'access stays closed');
  assert.equal(profile.json.viewer.isRequested, true, 'the request is still pending');
});

test('reels need a session and a video', async () => {
  const anon = await call('POST', '/api/reels', { body: { videoUrl: '/uploads/reel.mp4' } });
  assert.equal(anon.status, 401);

  const missingVideo = await call('POST', '/api/reels', { cookie: alice, body: { caption: 'no video' } });
  assert.equal(missingVideo.status, 400);
});

test('reels can be published, listed, liked, viewed, commented on and deleted', async () => {
  const created = await call('POST', '/api/reels', {
    cookie: alice,
    body: { videoUrl: '/uploads/reel-demo.mp4', caption: 'My first reel' },
  });
  assert.equal(created.status, 201);
  const reel = created.json.reel;
  const reelId = reel.id;
  assert.equal(reel.videoUrl, '/uploads/reel-demo.mp4');
  assert.equal(reel.caption, 'My first reel');
  assert.equal(reel.author.id, aliceId, 'the author is the creator, not the reel id');

  const feed = await call('GET', '/api/reels', { cookie: alice });
  assert.equal(feed.status, 200);
  assert.ok(feed.json.items.some((r: any) => r.id === reelId));

  // A profile-scoped feed only returns that author's reels.
  const byUsername = await call('GET', '/api/reels?username=alice', { cookie: alice });
  assert.equal(byUsername.status, 200);
  assert.ok(byUsername.json.items.every((r: any) => r.author.username === 'alice'));

  // Views are unique per viewer.
  const firstView = await call('POST', `/api/reels/${reelId}/view`, { cookie: bob });
  const secondView = await call('POST', `/api/reels/${reelId}/view`, { cookie: bob });
  assert.equal(firstView.status, 200);
  assert.equal(secondView.json.views, firstView.json.views);

  // Likes toggle on and off.
  const liked = await call('POST', `/api/reels/${reelId}/like`, { cookie: bob });
  assert.equal(liked.status, 200);
  assert.equal(liked.json.liked, true);
  assert.equal(liked.json.likes, 1);

  // The author is notified with a link to their own reels.
  const authorNotes = await call('GET', '/api/notifications', { cookie: alice });
  const likeNote = authorNotes.json.notifications.find(
    (n: any) => n.type === 'like' && n.data?.reelId === reelId,
  );
  assert.ok(likeNote, 'the author receives a reel-like notification');
  assert.equal(likeNote.link, '/reels?username=alice');

  const unliked = await call('POST', `/api/reels/${reelId}/like`, { cookie: bob });
  assert.equal(unliked.json.liked, false);
  assert.equal(unliked.json.likes, 0);

  // Comments round-trip and carry the commenter's real user id.
  const commented = await call('POST', `/api/reels/${reelId}/comments`, {
    cookie: bob,
    body: { content: 'Nice reel!' },
  });
  assert.equal(commented.status, 201);
  assert.equal(commented.json.comment.content, 'Nice reel!');
  assert.notEqual(commented.json.comment.author.id, aliceId);

  const comments = await call('GET', `/api/reels/${reelId}/comments`, { cookie: alice });
  assert.equal(comments.status, 200);
  assert.ok(comments.json.items.some((c: any) => c.content === 'Nice reel!'));

  const removed = await call('DELETE', `/api/reels/${reelId}/comments/${commented.json.comment.id}`, {
    cookie: bob,
  });
  assert.equal(removed.status, 200);

  // Only the author may delete the reel.
  const denied = await call('DELETE', `/api/reels/${reelId}`, { cookie: bob });
  assert.equal(denied.status, 403);

  const deleted = await call('DELETE', `/api/reels/${reelId}`, { cookie: alice });
  assert.equal(deleted.status, 200);

  const after = await call('GET', `/api/reels`, { cookie: alice });
  assert.ok(!after.json.items.some((r: any) => r.id === reelId));
});

test('the reel feed honours a page limit', async () => {
  const first = await call('POST', '/api/reels', {
    cookie: alice,
    body: { videoUrl: '/uploads/limit-a.mp4', caption: 'a' },
  });
  const second = await call('POST', '/api/reels', {
    cookie: alice,
    body: { videoUrl: '/uploads/limit-b.mp4', caption: 'b' },
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const page = await call('GET', '/api/reels?username=alice&limit=1', { cookie: alice });
  assert.equal(page.status, 200);
  assert.equal(page.json.items.length, 1);
  assert.equal(page.json.hasMore, true);

  await call('DELETE', `/api/reels/${first.json.reel.id}`, { cookie: alice });
  await call('DELETE', `/api/reels/${second.json.reel.id}`, { cookie: alice });
});

test('reels from private accounts stay hidden from non-followers', async () => {
  await call('PUT', '/api/settings', { cookie: carol, body: { isPrivate: true } });
  const created = await call('POST', '/api/reels', {
    cookie: carol,
    body: { videoUrl: '/uploads/private-reel.mp4', caption: 'private clip' },
  });
  assert.equal(created.status, 201);
  const reelId = created.json.reel.id;

  const hidden = await call('GET', `/api/reels/${reelId}`, { cookie: bob });
  assert.equal(hidden.status, 403);

  const direct = await call('POST', `/api/reels/${reelId}/like`, { cookie: bob });
  assert.equal(direct.status, 403);

  const own = await call('GET', `/api/reels/${reelId}`, { cookie: carol });
  assert.equal(own.status, 200);

  // Leave carol public again for later tests.
  await call('PUT', '/api/settings', { cookie: carol, body: { isPrivate: false } });
  await call('DELETE', `/api/reels/${reelId}`, { cookie: carol });
});

test('the password reset flow issues a usable, single-use token', async () => {
  const forgot = await call('POST', '/api/auth/forgot-password', {
    body: { email: 'alice@test.dev' },
  });
  assert.equal(forgot.status, 200);
  assert.ok(forgot.json.resetUrl, 'reset url is returned outside production');
  const token = new URL(forgot.json.resetUrl).searchParams.get('token');
  assert.ok(token);

  const reset = await call('POST', '/api/auth/reset-password', {
    body: { token, password: 'resetpass1' },
  });
  assert.equal(reset.status, 200);

  const login = await call('POST', '/api/auth/login', {
    body: { identifier: 'alice', password: 'resetpass1' },
  });
  assert.equal(login.status, 200);

  const reuse = await call('POST', '/api/auth/reset-password', {
    body: { token, password: 'anotherpass1' },
  });
  assert.equal(reuse.status, 400, 'a reset token cannot be reused');

  // Restore alice's original password (her session cookie is still valid).
  const restore = await call('POST', '/api/auth/change-password', {
    cookie: alice,
    body: { currentPassword: 'resetpass1', newPassword: 'password123' },
  });
  assert.equal(restore.status, 200);
});

test('the assistant offers prompts and answers a message', async () => {
  const suggestions = await call('GET', '/api/ai/suggestions');
  assert.equal(suggestions.status, 200);
  assert.ok(Array.isArray(suggestions.json.prompts));
  assert.ok(suggestions.json.assistant);

  const reply = await call('POST', '/api/ai/message', { body: { message: 'hello there' } });
  assert.equal(reply.status, 200);
});

test('logout clears the session cookie', async () => {
  const created = await register('logoutuser');
  const res = await call('POST', '/api/auth/logout', { cookie: created.cookie! });
  assert.equal(res.status, 200);
  assert.ok(!res.cookie || /bongchat_token=(;|$)/.test(res.cookie));
});

test('deleting the account ends the session', async () => {
  const created = await register('tempuser');
  const cookie = created.cookie!;
  const deleted = await call('DELETE', '/api/users/me', {
    cookie,
    body: { password: 'password123' },
  });
  assert.equal(deleted.status, 200);
  const me = await call('GET', '/api/auth/me', { cookie });
  assert.equal(me.json.user, null);
  const protectedRes = await call('GET', '/api/notifications', { cookie });
  assert.equal(protectedRes.status, 401);
});

