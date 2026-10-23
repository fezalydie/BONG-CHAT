import type { Knex } from 'knex';

/**
 * Reels are short vertical videos, separate from normal posts.
 *
 * A reel always has a video; the caption is optional. Likes, views and comments
 * mirror the post tables so the same privacy rules (private accounts, blocks)
 * can be applied to reels.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('reels', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('video_url').notNullable();
    t.text('caption').notNullable().defaultTo('');
    t.integer('views').notNullable().defaultTo(0);
    t.text('created_at').notNullable();
    t.index(['user_id', 'created_at'], 'reels_user_created_idx');
  });

  await knex.schema.createTable('reel_likes', (t) => {
    t.increments('id').primary();
    t.integer('reel_id').notNullable().references('id').inTable('reels').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('created_at').notNullable();
    t.unique(['reel_id', 'user_id']);
  });

  await knex.schema.createTable('reel_comments', (t) => {
    t.increments('id').primary();
    t.integer('reel_id').notNullable().references('id').inTable('reels').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('content').notNullable();
    t.text('created_at').notNullable();
    t.index(['reel_id'], 'reel_comments_reel_idx');
  });

  await knex.schema.createTable('reel_views', (t) => {
    t.increments('id').primary();
    t.integer('reel_id').notNullable().references('id').inTable('reels').onDelete('CASCADE');
    t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('created_at').notNullable();
    t.unique(['reel_id', 'user_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('reel_views');
  await knex.schema.dropTableIfExists('reel_comments');
  await knex.schema.dropTableIfExists('reel_likes');
  await knex.schema.dropTableIfExists('reels');
}
