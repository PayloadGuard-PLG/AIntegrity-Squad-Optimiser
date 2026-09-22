-- Resource Coach V2 — additive SQLite schema.
-- Do NOT rewrite or delete legacy squad_plan_runs. Legacy evidence remains read-only
-- and keeps its original provenance grade.

CREATE TABLE IF NOT EXISTS resource_coach_model_versions (
  model_version TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  transfer_class TEXT NOT NULL CHECK (transfer_class = 'ordinary'),
  parameter_json TEXT NOT NULL,
  validation_json TEXT NOT NULL,
  source_corpus_hash TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0,1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_resource_coach_one_active_model
  ON resource_coach_model_versions(active) WHERE active = 1;

CREATE TABLE IF NOT EXISTS resource_coach_preview (
  observation_id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  observation_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resource_coach_prediction (
  prediction_id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  input_json TEXT NOT NULL,
  prediction_json TEXT NOT NULL,
  FOREIGN KEY (model_version) REFERENCES resource_coach_model_versions(model_version)
);

-- A player calibration is evidence learned from a DIFFERENT preview and then
-- used as pre-outcome state for later predictions. It is never fitted from the
-- target preview being scored.
CREATE TABLE IF NOT EXISTS resource_coach_player_calibration (
  player_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  calibration_json TEXT NOT NULL,
  age_at_anchor INTEGER NOT NULL,
  tier_at_anchor TEXT NOT NULL,
  log_high_rate_offset REAL NOT NULL,
  log_low_rate_offset REAL NOT NULL,
  regularization_penalty REAL NOT NULL,
  anchor_observation_id TEXT NOT NULL,
  anchor_coach_label TEXT NOT NULL,
  anchor_multiplier REAL NOT NULL,
  anchor_affected_stat_count INTEGER NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind = 'separate-observed-anchor'),
  captured_at TEXT NOT NULL,
  -- Current validation is same-era/current-player-state. Revalidate at age/season
  -- transition rather than pretending the latent factor is lifetime-invariant.
  valid_for_age INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  PRIMARY KEY (player_id, model_version, valid_for_age),
  FOREIGN KEY (model_version) REFERENCES resource_coach_model_versions(model_version)
);

-- Canonical observed previews used for future recalibration. This table is
-- resource-coach specific so Reward / ordinary / unresolved provenance cannot be
-- silently mixed by a generic training-run shape.
CREATE TABLE IF NOT EXISTS resource_coach_observation (
  observation_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_state_id TEXT,
  observed_at TEXT NOT NULL,
  transfer_class TEXT NOT NULL CHECK (transfer_class IN ('ordinary','reward','unresolved')),
  transfer_class_source TEXT NOT NULL,
  coach_label TEXT NOT NULL,
  coach_family TEXT,
  displayed_multiplier REAL NOT NULL,
  affected_stat_count INTEGER NOT NULL CHECK (affected_stat_count > 0),
  player_age INTEGER NOT NULL,
  tier TEXT NOT NULL,
  stat TEXT NOT NULL,
  displayed_stat REAL,
  display_class TEXT NOT NULL CHECK (display_class IN ('WHITE','MID_GREY','UNKNOWN')),
  gain_lo REAL NOT NULL,
  gain_hi REAL NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind = 'observed-interval'),
  source_ref TEXT,
  PRIMARY KEY (observation_id, stat),
  FOREIGN KEY (observation_id) REFERENCES resource_coach_preview(observation_id),
  CHECK (gain_lo >= 0 AND gain_hi >= gain_lo)
);

CREATE INDEX IF NOT EXISTS idx_resource_coach_obs_player
  ON resource_coach_observation(player_id, player_age, transfer_class);
CREATE INDEX IF NOT EXISTS idx_resource_coach_obs_model_fit
  ON resource_coach_observation(transfer_class, display_class, displayed_multiplier, affected_stat_count);

-- Explicit OVR preview evidence. It remains a boost interval, never a fabricated
-- post-action OVR.
CREATE TABLE IF NOT EXISTS resource_coach_ovr_observation (
  observation_id TEXT PRIMARY KEY NOT NULL,
  boost_lo REAL NOT NULL,
  boost_hi REAL NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind = 'observed-boost-interval'),
  CHECK (boost_lo >= 0 AND boost_hi >= boost_lo),
  FOREIGN KEY (observation_id) REFERENCES resource_coach_preview(observation_id)
);
-- One immutable experiment is the isolation boundary for a coach preview.
-- Predictions must be captured while the experiment is open; the observed
-- preview closes it. partition is explicit so holdouts cannot silently become
-- fitting data.
CREATE TABLE IF NOT EXISTS resource_coach_experiment (
  experiment_id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  input_json TEXT NOT NULL,
  partition TEXT NOT NULL DEFAULT 'prospective-holdout'
    CHECK (partition IN ('prospective-holdout','retrospective','calibration','excluded')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','observed')),
  observed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_resource_coach_experiment_player
  ON resource_coach_experiment(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_resource_coach_experiment_partition
  ON resource_coach_experiment(partition, status);

CREATE TABLE IF NOT EXISTS resource_coach_experiment_prediction (
  experiment_id TEXT NOT NULL,
  prediction_id TEXT NOT NULL UNIQUE,
  model_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (experiment_id, prediction_id),
  UNIQUE (experiment_id, model_version),
  FOREIGN KEY (experiment_id) REFERENCES resource_coach_experiment(experiment_id),
  FOREIGN KEY (prediction_id) REFERENCES resource_coach_prediction(prediction_id)
);

CREATE TABLE IF NOT EXISTS resource_coach_prediction_score (
  experiment_id TEXT NOT NULL,
  prediction_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  scored_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scored','partial','unscored')),
  matched_stat_count INTEGER NOT NULL,
  endpoint_mae REAL,
  midpoint_mae REAL,
  mean_interval_iou REAL,
  score_json TEXT NOT NULL,
  PRIMARY KEY (experiment_id, prediction_id),
  FOREIGN KEY (experiment_id) REFERENCES resource_coach_experiment(experiment_id),
  FOREIGN KEY (prediction_id) REFERENCES resource_coach_prediction(prediction_id)
);

CREATE TABLE IF NOT EXISTS resource_coach_residual (
  experiment_id TEXT NOT NULL,
  prediction_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  stat TEXT NOT NULL,
  predicted_lo REAL NOT NULL,
  predicted_hi REAL NOT NULL,
  observed_lo REAL NOT NULL,
  observed_hi REAL NOT NULL,
  low_error REAL NOT NULL,
  high_error REAL NOT NULL,
  endpoint_abs_error REAL NOT NULL,
  midpoint_error REAL NOT NULL,
  width_error REAL NOT NULL,
  interval_iou REAL NOT NULL,
  PRIMARY KEY (experiment_id, prediction_id, stat),
  FOREIGN KEY (experiment_id) REFERENCES resource_coach_experiment(experiment_id),
  FOREIGN KEY (prediction_id) REFERENCES resource_coach_prediction(prediction_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_coach_residual_model
  ON resource_coach_residual(model_version, stat);

-- Partition provenance is append-only. The mutable partition on
-- resource_coach_experiment remains the current routing state for compatibility,
-- while this table preserves how that state was reached.
CREATE TABLE IF NOT EXISTS resource_coach_partition_event (
  event_seq INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('created','transition','legacy-snapshot')),
  from_partition TEXT CHECK (from_partition IS NULL OR from_partition IN ('prospective-holdout','retrospective','calibration','excluded')),
  to_partition TEXT NOT NULL CHECK (to_partition IN ('prospective-holdout','retrospective','calibration','excluded')),
  note TEXT,
  FOREIGN KEY (experiment_id) REFERENCES resource_coach_experiment(experiment_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_coach_partition_event
  ON resource_coach_partition_event(experiment_id, event_seq);

-- Exact empirical-evidence identity is independent of model, experiment id and
-- timestamps. The compact fingerprint is for indexing/display only; canonical_key
-- is the collision-safe equality check used for duplicate classification.
CREATE TABLE IF NOT EXISTS resource_coach_evidence_identity (
  experiment_id TEXT PRIMARY KEY NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  canonical_key TEXT NOT NULL,
  duplicate_of_experiment_id TEXT,
  detected_at TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES resource_coach_experiment(experiment_id),
  FOREIGN KEY (duplicate_of_experiment_id) REFERENCES resource_coach_experiment(experiment_id)
);

CREATE INDEX IF NOT EXISTS idx_resource_coach_evidence_fingerprint
  ON resource_coach_evidence_identity(evidence_fingerprint);


