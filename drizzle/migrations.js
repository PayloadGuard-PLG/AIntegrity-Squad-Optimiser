// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo
// SQL content is inlined as strings — Metro cannot import .sql files as text via assetExts

import journal from './meta/_journal.json';

const m0000 = `CREATE TABLE \`coaches\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`type\` text NOT NULL,
	\`session_type\` text DEFAULT 'Training' NOT NULL,
	\`multiplier\` integer NOT NULL,
	\`attributes\` text DEFAULT '[]' NOT NULL,
	\`source\` text DEFAULT 'Academy' NOT NULL,
	\`cost_currency\` text DEFAULT 'free' NOT NULL,
	\`cost_amount\` integer DEFAULT 0 NOT NULL,
	\`duration_days\` integer DEFAULT 1 NOT NULL,
	\`created_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`players\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`roles\` text DEFAULT '["ST"]' NOT NULL,
	\`age\` integer NOT NULL,
	\`overall\` real NOT NULL,
	\`tier\` text DEFAULT 'None' NOT NULL,
	\`stats\` text DEFAULT '{}' NOT NULL,
	\`is_mutant_candidate\` integer DEFAULT false NOT NULL,
	\`created_at\` integer NOT NULL
);`;

const m0001 = `CREATE TABLE \`drill_sessions\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`player_id\` text NOT NULL,
	\`drill_name\` text NOT NULL,
	\`session_count\` integer DEFAULT 1 NOT NULL,
	\`drill_level\` text DEFAULT 'Amateur' NOT NULL,
	\`talent_tier\` text DEFAULT 'Normal' NOT NULL,
	\`twox_ad\` integer DEFAULT false NOT NULL,
	\`created_at\` integer NOT NULL
);`;

const m0002 = `ALTER TABLE \`players\` ADD \`talent\` text DEFAULT 'Normal' NOT NULL;`;

const m0003 = `ALTER TABLE \`players\` ADD \`snapshot\` text DEFAULT NULL;`;

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
  },
};
