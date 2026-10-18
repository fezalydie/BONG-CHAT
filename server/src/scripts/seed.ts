import bcrypt from 'bcryptjs';
import { db, runMigrations, isoNow, isoInHours } from '../db.js';

/**
 * Demo data so a fresh BONG CHAT install is not empty.
 * Every account uses the password: password123
 * Run with:  npm run seed
 */

const USERS = [
  { username: 'alice', email: 'alice@bongchat.dev', displayName: 'Alice Rahman', bio: 'Coffee, code and camera rolls ☕📸' },
  { username: 'bishal', email: 'bishal@bongchat.dev', displayName: 'Bishal Chowdhury', bio: 'Football on weekends, posts on weekdays ⚽' },
  { username: 'chitra', email: 'chitra@bongchat.dev', displayName: 'Chitra Das', bio: 'Painter • storyteller • tea enthusiast 🎨' },
  { username: 'dipu', email: 'dipu@bongchat.dev', displayName: 'Dipu Hossain', bio: 'Building things on the internet 🛠️' },
];

const POSTS: Array<{ user: string; content: string }> = [
  { user: 'alice', content: 'First post on BONG CHAT! 🎉 This feels like a cosy corner of the internet. #hello #bongchat' },
  { user: 'bishal', content: 'Anyone up for a chat? The messaging here is real-time and buttery smooth 💬 #chat' },
  { user: 'chitra', content: 'Painted all evening. Stories last 24 hours — posts last forever. Choose wisely 😄 #art #stories' },
  { user: 'dipu', content: 'Shortcuts to Facebook, Instagram and WhatsApp right in the sidebar. One tab to rule them all. #productivity' },
  { user: 'alice', content: 'Tip: add #hashtags to your posts — they show up in search. And the AI assistant knows every feature. #tips' },
];

const STORIES: Array<{ user: string; content: string; style: string }> = [
  { user: 'alice', content: 'Good morning from the balcony ☀️', style: 'sunset' },
  { user: 'chitra', content: 'Studio day 🎨', style: 'grape' },
  { user: 'bishal', content: 'Match day! ⚽', style: 'ocean' },
];

async function main(): Promise<void> {
  await runMigrations();

  const existing = await db('users').where({ username: 'alice' }).first();
  if (existing) {
    console.log('[seed] demo data already present — nothing to do.');
    await db.destroy();
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 10);
  const ids = new Map<string, number>();
  for (const user of USERS) {
    const [id] = await db('users')
      .insert({
        username: user.username,
        email: user.email,
        password_hash: passwordHash,
        display_name: user.displayName,
        bio: user.bio,
        created_at: isoNow(),
      })
      .returning('id');
    ids.set(user.username, typeof id === 'object' ? (id as any).id : (id as number));
  }

  // Everyone follows everyone (a friendly little network).
  const followRows: Record<string, unknown>[] = [];
  for (const a of USERS) {
    for (const b of USERS) {
      if (a.username === b.username) continue;
      followRows.push({
        follower_id: ids.get(a.username),
        follow_id: ids.get(b.username),
        created_at: isoNow(),
      });
    }
  }
  await db('follows').insert(followRows);

  const postIds: number[] = [];
  for (const post of POSTS) {
    const [id] = await db('posts')
      .insert({
        user_id: ids.get(post.user),
        content: post.content,
        created_at: isoNow(),
        views: Math.floor(Math.random() * 40) + 5,
      })
      .returning('id');
    postIds.push(typeof id === 'object' ? (id as any).id : (id as number));
  }

  // A few likes and a comment so the feed looks alive.
  await db('post_likes').insert(
    postIds.flatMap((postId, index) =>
      USERS.filter((_, ui) => ui !== index % USERS.length).map((u) => ({
        post_id: postId,
        user_id: ids.get(u.username),
        created_at: isoNow(),
      })),
    ),
  );
  await db('comments').insert([
    {
      post_id: postIds[0],
      user_id: ids.get('bishal'),
      content: 'Welcome aboard, Alice! 🙌',
      created_at: isoNow(),
    },
    {
      post_id: postIds[1],
      user_id: ids.get('chitra'),
      content: 'Always! 👋',
      created_at: isoNow(),
    },
  ]);

  const storyRows = STORIES.map((story) => ({
    user_id: ids.get(story.user),
    content: story.content,
    style: story.style,
    created_at: isoNow(),
    expires_at: isoInHours(24),
  }));
  await db('stories').insert(storyRows);

  // One demo conversation: Alice ↔ Bishal.
  const now = isoNow();
  const [conversationId] = await db('conversations')
    .insert({ created_at: now, last_message_at: now })
    .returning('id');
  const cid = typeof conversationId === 'object' ? (conversationId as any).id : (conversationId as number);
  await db('conversation_participants').insert([
    { conversation_id: cid, user_id: ids.get('alice') },
    { conversation_id: cid, user_id: ids.get('bishal') },
  ]);
  await db('messages').insert([
    {
      conversation_id: cid,
      sender_id: ids.get('bishal'),
      content: 'Hey Alice! Welcome to BONG CHAT 👋',
      created_at: isoNow(),
      read_at: isoNow(),
    },
    {
      conversation_id: cid,
      sender_id: ids.get('alice'),
      content: 'Thanks! The stories rail looks great.',
      created_at: isoNow(),
      read_at: isoNow(),
    },
    {
      conversation_id: cid,
      sender_id: ids.get('bishal'),
      content: 'Try the AI assistant too — tap the sparkle button in the corner ✨',
      created_at: isoNow(),
    },
  ]);

  console.log('');
  console.log('  ✅ Demo data created. Sign in with:');
  for (const user of USERS) {
    console.log(`     ${user.username} / password123`);
  }
  console.log('');
  await db.destroy();
}

main().catch((error) => {
  console.error('[seed] failed:', error);
  process.exit(1);
});
