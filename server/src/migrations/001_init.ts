import type { Knex } from 'knex';

/**
 * BONG CHAT initial schema.
 * Timestamps are stored as ISO-8601 text so the exact same schema works
 * on SQLite and PostgreSQL, and so lexicographic ordering == time ordering.
 */
export async function up(knex: Knex): Promise<void> {
  // ---------------- accounts ----------------
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.text('username').notNullable().unique();
    t.text('email').notNullable().unique();
    t.text('password_hash').notNullable();
    t.text('display_name').notNullable();
    t.text('bio').notNullable().defaultTo('');
    t.text('avatar_url').notNullable().defaultTo('');
    t.text('cover_url').notNullable().defaultTo('');
    t.boolean('is_private').notNullable().defaultTo(false);
    t.text('theme').notNullable().defaultTo('system');
    t.text('language').notNullable().defaultTo('en');
    t.text('notification_prefs').notNullable().defaultTo('{"likes":true,"comments":true,"follows":true,"messages":true,"shares":true}');
    t.text('last_seen_at');
    t.text('created_at').notNullable();
  });

  await knex.schema.createTable('password_resets', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('token_hash').notNullable();
    t.text('expires_at').notNullable();
    t.boolean('used').notNullable().defaultTo(false);
    t.text('created_at').notNullable();
  });

  // ---------------- social graph ----------------
  await knex.schema.createTable('follows', (t) => {
    t.increments('id').primary();
    t.integer('follower_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('follow_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('created_at').notNullable();
    t.unique(['follower_id', 'follow_id']);
  });

  await knex.schema.createTable('blocks', (t) => {
    t.increments('id').primary();
    t.integer('blocker_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('blocked_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('created_at').notNullable();
    t.unique(['blocker_id', 'blocked_id']);
  });

  // ---------------- posts ----------------
  await knex.schema.createTable('posts', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('content').notNullable().defaultTo('');
    t.text('image_url').notNullable().defaultTo('');
    t.integer('views').notNullable().defaultTo(0);
    t.text('created_at').notNullable();
    t.index(['user_id', 'created_at'], 'posts_user_created_idx');
  });

  await knex.schema.createTable('post_likes', (t) => {
    t.increments('id').primary();
    t.integer('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('created_at').notNullable();
    t.unique(['post_id', 'user_id']);
  });

  await knex.schema.createTable('comments', (t) => {
    t.increments('id').primary();
    t.integer('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('content').notNullable();
    t.text('created_at').notNullable();
    t.index(['post_id'], 'comments_post_idx');
  });

  // A "share" reposts somebody else's post to your own timeline.
  await knex.schema.createTable('shares', (t) => {
    t.increments('id').primary();
    t.integer('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('note').notNullable().defaultTo('');
    t.text('created_at').notNullable();
    t.unique(['post_id', 'user_id']);
    t.index(['user_id', 'created_at'], 'shares_user_idx');
  });

  // Unique views per user per post (for the view counter).
  await knex.schema.createTable('post_views', (t) => {
    t.increments('id').primary();
    t.integer('post_id').notNullable().references('id').inTable('posts').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('created_at').notNullable();
    t.unique(['post_id', 'user_id']);
  });

  // ---------------- stories ----------------
  await knex.schema.createTable('stories', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('content').notNullable().defaultTo('');
    t.text('image_url').notNullable().defaultTo('');
    t.text('style').notNullable().defaultTo('sunset');
    t.text('created_at').notNullable();
    t.text('expires_at').notNullable();
    t.index(['expires_at'], 'stories_expiry_idx');
  });

  await knex.schema.createTable('story_views', (t) => {
    t.increments('id').primary();
    t.integer('story_id').notNullable().references('id').inTable('stories').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('viewed_at').notNullable();
    t.unique(['story_id', 'user_id']);
  });

  // ---------------- messaging ----------------
  await knex.schema.createTable('conversations', (t) => {
    t.increments('id').primary();
    t.text('last_message_at').notNullable();
    t.text('created_at').notNullable();
  });

  await knex.schema.createTable('conversation_participants', (t) => {
    t.increments('id').primary();
    t.integer('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.unique(['conversation_id', 'user_id']);
  });

  await knex.schema.createTable('messages', (t) => {
    t.increments('id').primary();
    t.integer('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    t.integer('sender_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('content').notNullable().defaultTo('');
    t.text('image_url').notNullable().defaultTo('');
    t.text('created_at').notNullable();
    t.text('read_at');
    t.index(['conversation_id', 'id'], 'messages_conversation_idx');
  });

  // ---------------- notifications ----------------
  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.integer('actor_id').references('id').inTable('users').onDelete('SET NULL');
    t.text('type').notNullable(); // like | comment | follow | share | message | system
    t.integer('entity_id'); // post / story / conversation id, when relevant
    t.text('link').notNullable().defaultTo('');
    t.text('data').notNullable().defaultTo('{}');
    t.boolean('read').notNullable().defaultTo(false);
    t.text('created_at').notNullable();
    t.index(['user_id', 'read'], 'notifications_user_idx');
  });
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'notifications',
    'messages',
    'conversation_participants',
    'conversations',
    'story_views',
    'stories',
    'post_views',
    'shares',
    'comments',
    'post_likes',
    'posts',
    'blocks',
    'follows',
    'password_resets',
    'users',
  ];
  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
}
