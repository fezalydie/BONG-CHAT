import type { Knex } from 'knex';

/**
 * Story replies are ordinary direct messages that reference the story they
 * replied to. `story_id` links back to the story (and is nulled if the story is
 * purged), while `story_snapshot` keeps a small copy of the story so the reply
 * bubble still renders after the 24-hour story expiry.
 */
export async function up(knex: Knex): Promise<void> {
  const hasStoryId = await knex.schema.hasColumn('messages', 'story_id');
  if (!hasStoryId) {
    await knex.schema.alterTable('messages', (t) => {
      t.integer('story_id').references('id').inTable('stories').onDelete('SET NULL');
      t.text('story_snapshot');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasStoryId = await knex.schema.hasColumn('messages', 'story_id');
  if (hasStoryId) {
    await knex.schema.alterTable('messages', (t) => {
      t.dropColumn('story_snapshot');
      t.dropColumn('story_id');
    });
  }
}
