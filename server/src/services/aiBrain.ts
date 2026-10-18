import { config } from '../config.js';

/**
 * BONG CHAT's assistant personality: "Bongy".
 *
 * Two modes:
 *  1. Built-in rule engine (default) — zero configuration, answers questions
 *     about how BONG CHAT works and general chit-chat.
 *  2. External provider — if AI_PROVIDER + AI_API_KEY are set in .env, the
 *     request is forwarded to any OpenAI-compatible API. Keys stay on the
 *     server and are never exposed to the browser.
 */

const PERSONA = `You are "Bongy", the cheerful built-in assistant of BONG CHAT — a social
networking hub where people post, share stories, chat in real time, and keep
shortcuts to Facebook, Instagram and WhatsApp in one place.
Be warm, concise and practical. Use short paragraphs or bullet points.
If asked how to do something in BONG CHAT, give the exact steps (where to click).
Never invent features that do not exist. If you are unsure, say so and suggest
the Help section in Settings.`;

interface Intent {
  keywords: string[];
  answer: string;
}

const INTENTS: Intent[] = [
  {
    keywords: ['hello', 'hi', 'hey', 'salam', 'assalam', 'namaste', 'good morning', 'good evening'],
    answer: `Hey there! 👋 I'm Bongy, your BONG CHAT companion.

I can help you:
• Write your first post or story
• Start a chat with a friend
• Adjust privacy, theme and notifications
• Jump to Facebook, Instagram or WhatsApp from the quick links

What would you like to do?`,
  },
  {
    keywords: ['post', 'publish', 'share thought', 'create post', 'how to post'],
    answer: `To create a post:
1. Open the **Feed** (home icon in the sidebar).
2. Type in the "What's on your mind?" box.
3. Click the image icon 📷 to add a photo (it uploads instantly).
4. Press **Post** — it appears at the top of the feed.

You can also add #hashtags so other people can find your post through search.`,
  },
  {
    keywords: ['story', 'stories', 'status', '24 hour', 'expire'],
    answer: `Stories are temporary updates that disappear after 24 hours.

• **Add one:** click your own avatar with a "+" at the top of the feed, or the "Your story" tile in the stories rail.
• **Watch:** click any friend's avatar in the rail; tap left/right to move between stories.
• **See who watched:** open your own story — the viewer list is at the bottom.
• The coloured ring around an avatar means that person has stories you haven't seen yet.`,
  },
  {
    keywords: ['message', 'chat', 'dm', 'send message', 'conversation', 'inbox'],
    answer: `To chat with someone:
1. Open **Messages** in the sidebar (or tap the chat icon on mobile).
2. Click the ✏️ new-message button and pick a person, or search their name.
3. Type and hit Enter — messages arrive in real time.

You can share links (they become clickable) and send photos 📷 from the chat bar. A green dot means your friend is online.`,
  },
  {
    keywords: ['follow', 'unfollow', 'followers', 'friend request'],
    answer: `To follow somebody:
1. Use the **Search** bar at the top to find them.
2. Open their profile.
3. Press **Follow** — press it again to unfollow.

Their posts then show up in your home feed. On a private account, only approved followers can see their posts and stories.`,
  },
  {
    keywords: ['private', 'privacy', 'private account', 'hide my posts'],
    answer: `You can make your account private:
**Settings → Privacy → Private account** (or Profile → Edit profile).

When your account is private:
• Only people who follow you can see your posts and stories.
• New followers have to be accepted by following you first.
You can also block people from any profile page.`,
  },
  {
    keywords: ['block', 'blocked', 'unblock', 'restrict'],
    answer: `To block someone:
1. Open their profile.
2. Press **Block** (in the ⋯ menu).
3. Confirm.

They immediately lose access to your profile, posts and chats, and you stop seeing each other everywhere. Manage the list in **Settings → Blocked users**.`,
  },
  {
    keywords: ['theme', 'dark mode', 'light mode', 'appearance', 'colour', 'color'],
    answer: `To change the look of BONG CHAT:
**Settings → Appearance** and pick **Light**, **Dark** or **System** (follows your device).

The theme applies instantly and is remembered for your account on every device.`,
  },
  {
    keywords: ['notification', 'mute', 'alert', 'sound'],
    answer: `Notification preferences live in **Settings → Notifications**.

You can switch likes, comments, follows, shares and messages on/off individually, plus a sound toggle. New messages also arrive instantly in the app while it's open.`,
  },
  {
    keywords: ['password', 'forgot', 'reset', 'login problem', 'sign in problem', 'cannot log'],
    answer: `Locked out? No problem:
1. On the sign-in page click **Forgot password?**
2. Enter your email — a reset link is generated.
3. Open the link and choose a new password (minimum 6 characters).

If no email service is configured on the server, the link is printed in the server console so a local admin can share it. You can also change your password anytime in **Settings → Account**.`,
  },
  {
    keywords: ['facebook', 'instagram', 'whatsapp', 'wa', 'external', 'shortcut', 'integration', 'social media'],
    answer: `BONG CHAT keeps shortcuts to the big three in the sidebar's **Quick links** panel (and in the mobile menu):

• **Facebook** — opens facebook.com (or the app on mobile)
• **Instagram** — opens instagram.com (or the app on mobile)
• **WhatsApp** — opens WhatsApp Web, or starts a chat via wa.me / the app

They open in a new tab so you never lose your place here. BONG CHAT's own feed, stories and chat work independently of those platforms.`,
  },
  {
    keywords: ['search', 'find people', 'find posts', 'hashtag', 'topic'],
    answer: `The search bar at the top works like a browser address bar:

• Type a **name** to find people.
• Type a word to find **posts** and **#topics**.
• Type a **website address** (e.g. bbc.com) and press Enter to open it directly.
• Pick a search engine (Google, DuckDuckGo, YouTube, Wikipedia) to continue on the web.

There's a dedicated **Search** page too, if you prefer a bigger canvas.`,
  },
  {
    keywords: ['share', 'repost', 'reshare'],
    answer: `To share somebody's post to your own timeline:
1. Press the **repost** icon (two arrows) under the post.
2. Optionally add a note, then confirm.

Press the same icon again to undo. The original author is always credited, and the original post's engagement stats stay visible.`,
  },
  {
    keywords: ['view', 'views', 'seen count', 'analytics'],
    answer: `Posts track unique views — one view per person who scrolls past it in their feed. The eye icon under each post shows the count, along with likes, comments and shares.

Stories show their own view list: open one of your stories to see exactly who watched it.`,
  },
  {
    keywords: ['delete', 'remove post', 'edit profile', 'bio', 'avatar', 'profile picture'],
    answer: `**Edit your profile:** Profile page → **Edit profile** to change your photo, cover, display name and bio.

**Delete a post:** open the ⋯ menu on your own post → **Delete**. Comments you don't like can be deleted by you or by the post's author.`,
  },
  {
    keywords: ['who are you', 'what can you do', 'help', 'commands', 'features'],
    answer: `I'm **Bongy** 🤖 — part guide, part cheerleader for BONG CHAT.

Things I can help with:
• Getting started: posting, stories, following people
• Messaging, sharing and notifications
• Privacy, blocking, themes and account settings
• Explaining the Facebook / Instagram / WhatsApp shortcuts

Ask me anything about how the app works!`,
  },
  {
    keywords: ['thanks', 'thank you', 'shukriya', 'dhonnobad'],
    answer: `Anytime! 😊 That's what I'm here for. Enjoy BONG CHAT!`,
  },
];

function findAnswer(message: string): string {
  const lower = message.toLowerCase();
  let best: { intent: Intent; score: number } | null = null;
  for (const intent of INTENTS) {
    let score = 0;
    for (const keyword of intent.keywords) {
      if (lower.includes(keyword)) score += keyword.includes(' ') ? 3 : 2;
    }
    if (score > 0 && (!best || score > best.score)) best = { intent, score };
  }
  if (best) return best.intent.answer;
  return `I want to make sure I give you the right help 🤔 — I'm still learning, and I know everything about BONG CHAT:

• **Posting** — write a post, add a photo, use #hashtags
• **Stories** — share moments that vanish after 24h
• **Messaging** — real-time chats with photos and links
• **People** — follow, unfollow, block, private accounts
• **Settings** — theme, notifications, password, privacy

Try asking me about one of those, or open **Settings → Help & support** for more.`;
}

async function askProvider(message: string, history: Array<{ role: string; content: string }>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${config.ai.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ai.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.ai.model,
        temperature: 0.7,
        messages: [
          { role: 'system', content: PERSONA },
          ...history.slice(-10).map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: message },
        ],
      }),
    });
    if (!response.ok) throw new Error(`provider responded ${response.status}`);
    const data = (await response.json()) as any;
    const reply = data?.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('empty reply');
    return reply.trim();
  } finally {
    clearTimeout(timer);
  }
}

export async function askAssistant(
  message: string,
  history: Array<{ role: string; content: string }> = [],
): Promise<{ reply: string; source: 'provider' | 'builtin' }> {
  if (config.ai.enabled) {
    try {
      const reply = await askProvider(message, history);
      return { reply, source: 'provider' };
    } catch (error) {
      console.warn('[ai] provider failed, falling back to built-in assistant:', (error as Error).message);
    }
  }
  return { reply: findAnswer(message), source: 'builtin' };
}

export const SUGGESTED_PROMPTS = [
  'How do I post something?',
  'How do stories work?',
  'How do I start a chat?',
  'How do I make my account private?',
  'Open Facebook, Instagram and WhatsApp',
  'How do I change to dark mode?',
];
