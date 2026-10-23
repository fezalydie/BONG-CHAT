import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('comment_likes');
  if (!hasTable) {
    await knex.schema.createTable('comment_likes', (t) => {
      t.increments('id').primary();
      t.integer('comment_id').notNullable().references('id').inTable('comments').onDelete('CASCADE');
      t.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      t.text('created_at').notNullable();
      t.unique(['comment_id', 'user_id']);
      t.index(['comment_id'], 'comment_likes_comment_idx');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('comment_likes');
  if (hasTable) {
    await knex.schema.dropTable('comment_likes');
  }
}
