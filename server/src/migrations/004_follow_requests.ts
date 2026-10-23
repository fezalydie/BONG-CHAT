import type { Knex } from 'knex';

/**
 * Private accounts need follow *requests*, not instant follows. This adds a
 * `status` column to `follows`:
 *
 *   - 'accepted' — the follow is live (all pre-existing rows, and any follow of
 *                  a public account).
 *   - 'pending'  — a request waiting for a private account's owner to approve.
 *
 * Only 'accepted' rows grant access to a private account's content or count
 * towards follower totals.
 */
export async function up(knex: Knex): Promise<void> {
  const hasStatus = await knex.schema.hasColumn('follows', 'status');
  if (!hasStatus) {
    await knex.schema.alterTable('follows', (t) => {
      t.text('status').notNullable().defaultTo('accepted');
      t.index(['follow_id', 'status'], 'follows_target_status_idx');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasStatus = await knex.schema.hasColumn('follows', 'status');
  if (hasStatus) {
    await knex.schema.alterTable('follows', (t) => {
      t.dropIndex(['follow_id', 'status'], 'follows_target_status_idx');
      t.dropColumn('status');
    });
  }
}
