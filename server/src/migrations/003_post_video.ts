import type { Knex } from 'knex';

/**
 * Posts originally supported a single photo. This adds a `video_url` column so a
 * post can carry a short video instead. A post uses at most one of
 * `image_url` / `video_url`, but both columns are kept so either can be set.
 */
export async function up(knex: Knex): Promise<void> {
  const hasVideo = await knex.schema.hasColumn('posts', 'video_url');
  if (!hasVideo) {
    await knex.schema.alterTable('posts', (t) => {
      t.text('video_url').notNullable().defaultTo('');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasVideo = await knex.schema.hasColumn('posts', 'video_url');
  if (hasVideo) {
    await knex.schema.alterTable('posts', (t) => {
      t.dropColumn('video_url');
    });
  }
}
