-- PHS initial design. PostgreSQL 17+. Applied by dbmate inside one transaction.
-- Service roles and grants are added in 005.
-- migrate:up
CREATE SCHEMA phs;
SET LOCAL search_path = phs, public;

CREATE TABLE app_user (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 identity_issuer text NOT NULL,
 identity_subject text NOT NULL,
 display_name text NOT NULL CHECK (btrim(display_name) <> ''),
 email text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(identity_issuer, identity_subject)
);
CREATE TABLE practice (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE,
 name text NOT NULL,
 timezone text NOT NULL DEFAULT 'America/Mexico_City'
);
CREATE TABLE practice_membership (
 practice_id uuid NOT NULL REFERENCES practice,
 user_id uuid NOT NULL REFERENCES app_user,
 role text NOT NULL CHECK (role IN ('pm','lead','director','admin')),
 PRIMARY KEY(practice_id,user_id,role)
);
CREATE TABLE client (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL,
 primary_contact text,
 escalation_notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE service_type (
 code text PRIMARY KEY,
 name text NOT NULL UNIQUE,
 active boolean NOT NULL DEFAULT true
);
INSERT INTO service_type(code,name) VALUES
 ('development','Desarrollo'),('architecture','Arquitectura'),
 ('devsecops','DevSecOps'),('assessment','Assessment'),
 ('support','AMS / Soporte'),('staffing','Staffing / AT'),
 ('consulting','Consultoría'),('data_ai','Data & IA');
CREATE TABLE project (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 practice_id uuid NOT NULL REFERENCES practice,
 client_id uuid NOT NULL REFERENCES client,
 code text NOT NULL UNIQUE,
 name text NOT NULL,
 description text NOT NULL DEFAULT '',
 service_type_code text NOT NULL REFERENCES service_type,
 status text NOT NULL DEFAULT 'planned'
   CHECK(status IN ('planned','active','paused','renewing','closed')),
 pm_id uuid NOT NULL REFERENCES app_user,
 lead_id uuid NOT NULL REFERENCES app_user,
 technical_owner_id uuid NOT NULL REFERENCES app_user,
 sponsor_id uuid REFERENCES app_user,
 starts_on date NOT NULL,
 ends_on date NOT NULL,
 currency text NOT NULL DEFAULT 'MXN' CHECK(currency ~ '^[A-Z]{3}$'),
 timezone text NOT NULL DEFAULT 'America/Mexico_City',
 current_baseline_id uuid,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_on >= starts_on)
);
CREATE TABLE project_member (
 project_id uuid NOT NULL REFERENCES project,
 user_id uuid NOT NULL REFERENCES app_user,
 role text NOT NULL CHECK(role IN ('contributor','viewer')),
 allocation_pct numeric(5,2) CHECK(allocation_pct BETWEEN 0 AND 100),
 PRIMARY KEY(project_id,user_id)
);
CREATE TABLE milestone (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 title text NOT NULL,
 deliverable text NOT NULL DEFAULT '',
 owner_id uuid NOT NULL REFERENCES app_user,
 due_on date NOT NULL,
 critical boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','in_progress','completed','rescheduled','cancelled')),
 progress_pct numeric(5,2) CHECK(progress_pct BETWEEN 0 AND 100),
 completed_on date,
 completion_note text,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 UNIQUE(project_id,id),
 CHECK((status = 'completed') = (completed_on IS NOT NULL))
);
-- Overdue is derived from due_on and status, never stored as a status.
CREATE TABLE risk (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 risk_type text NOT NULL CHECK(risk_type IN ('project','client')),
 category text NOT NULL,
 probability smallint NOT NULL CHECK(probability BETWEEN 1 AND 3),
 impact smallint NOT NULL CHECK(impact BETWEEN 1 AND 3),
 owner_id uuid NOT NULL REFERENCES app_user,
 mitigation_due_on date NOT NULL,
 strategy text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open'
   CHECK(status IN ('open','mitigating','mitigated','materialized','closed')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 UNIQUE(project_id,id)
);
CREATE TABLE renewal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 due_on date NOT NULL,
 owner_id uuid NOT NULL REFERENCES app_user,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','renewed','cancelled')),
 notes text NOT NULL DEFAULT '',
 UNIQUE(project_id,id)
);
CREATE TABLE financial_observation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 effective_on date NOT NULL,
 total_cost numeric(18,2) NOT NULL CHECK(total_cost >= 0),
 total_effort_hours numeric(18,2) CHECK(total_effort_hours >= 0),
 source text NOT NULL,
 recorded_by uuid NOT NULL REFERENCES app_user,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 supersedes_id uuid,
 UNIQUE(project_id,id),
 UNIQUE(supersedes_id),
 FOREIGN KEY(project_id,supersedes_id) REFERENCES financial_observation(project_id,id),
 CHECK(supersedes_id IS DISTINCT FROM id)
);

CREATE TABLE project_change (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 title text NOT NULL,
 description text NOT NULL,
 change_type text NOT NULL CHECK(change_type IN ('client','internal','regulatory','technical')),
 proposed_by uuid NOT NULL REFERENCES app_user,
 proposed_at timestamptz NOT NULL DEFAULT now(),
 -- Submitted proposal is immutable; a correction is a new proposal.
 requested_impact jsonb NOT NULL CHECK(jsonb_typeof(requested_impact) = 'object'),
 UNIQUE(project_id,id)
);
CREATE TABLE change_decision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 change_id uuid NOT NULL UNIQUE,
 decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 decided_by uuid NOT NULL REFERENCES app_user,
 decided_at timestamptz NOT NULL DEFAULT now(),
 comment text NOT NULL CHECK(btrim(comment) <> ''),
 UNIQUE(project_id,id),
 UNIQUE(project_id,id,decision),
 FOREIGN KEY(project_id,change_id) REFERENCES project_change(project_id,id)
);
CREATE TABLE baseline (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 version integer NOT NULL CHECK(version > 0),
 previous_baseline_id uuid,
 approved_decision_id uuid UNIQUE,
 decision_kind text NOT NULL DEFAULT 'approved' CHECK(decision_kind = 'approved'),
 starts_on date NOT NULL,
 ends_on date NOT NULL,
 scope text NOT NULL,
 budget numeric(18,2) CHECK(budget >= 0),
 effort_hours numeric(18,2) CHECK(effort_hours >= 0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 -- Frozen commitments, including names, owners, IDs and dates, not live pointers.
 milestone_snapshot jsonb NOT NULL CHECK(jsonb_typeof(milestone_snapshot) = 'array'),
 team_snapshot jsonb NOT NULL CHECK(jsonb_typeof(team_snapshot) = 'array'),
 reason text NOT NULL CHECK(btrim(reason) <> ''),
 created_by uuid NOT NULL REFERENCES app_user,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,id),
 UNIQUE(project_id,version),
 UNIQUE(previous_baseline_id),
 FOREIGN KEY(project_id,previous_baseline_id) REFERENCES baseline(project_id,id),
 FOREIGN KEY(project_id,approved_decision_id,decision_kind)
   REFERENCES change_decision(project_id,id,decision),
 CHECK(ends_on >= starts_on),
 CHECK((version = 1 AND previous_baseline_id IS NULL AND approved_decision_id IS NULL)
    OR (version > 1 AND previous_baseline_id IS NOT NULL AND approved_decision_id IS NOT NULL)),
 CHECK(previous_baseline_id IS DISTINCT FROM id)
);
ALTER TABLE project ADD CONSTRAINT project_current_baseline_fk
 FOREIGN KEY(id,current_baseline_id) REFERENCES baseline(project_id,id);

CREATE TABLE review_policy (
 project_id uuid PRIMARY KEY REFERENCES project,
 cadence text NOT NULL CHECK(cadence IN ('weekly','fortnightly','monthly')),
 evidence_required boolean NOT NULL DEFAULT true,
 lead_validation_required boolean NOT NULL DEFAULT true,
 auto_tasks boolean NOT NULL DEFAULT true,
 forecast_cycles smallint NOT NULL DEFAULT 2 CHECK(forecast_cycles BETWEEN 1 AND 12)
);
CREATE TABLE review_cycle (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 starts_on date NOT NULL,
 due_on date NOT NULL,
 policy_snapshot jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshot) = 'object'),
 UNIQUE(project_id,id),
 UNIQUE(project_id,starts_on),
 CHECK(due_on >= starts_on)
);
CREATE TABLE health_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 cycle_id uuid NOT NULL,
 revision_no integer NOT NULL CHECK(revision_no > 0),
 supersedes_id uuid,
 author_id uuid NOT NULL REFERENCES app_user,
 submitted_at timestamptz NOT NULL DEFAULT now(),
 effective_on date NOT NULL,
 nothing_changed boolean NOT NULL DEFAULT false,
 topics text[] NOT NULL DEFAULT '{}',
 client_climate text CHECK(client_climate IN ('good','tense','critical')),
 support_text text,
 duration_seconds integer CHECK(duration_seconds >= 0),
 -- Submitted payload and expectations are reproducible; drafts stay separate.
 submitted_data jsonb NOT NULL CHECK(jsonb_typeof(submitted_data) = 'object'),
 expectations_snapshot jsonb NOT NULL CHECK(jsonb_typeof(expectations_snapshot) = 'array'),
 UNIQUE(project_id,id),
 UNIQUE(project_id,cycle_id,id),
 UNIQUE(cycle_id,revision_no),
 UNIQUE(supersedes_id),
 FOREIGN KEY(project_id,cycle_id) REFERENCES review_cycle(project_id,id),
 FOREIGN KEY(project_id,cycle_id,supersedes_id) REFERENCES health_review(project_id,cycle_id,id),
 CHECK((revision_no = 1 AND supersedes_id IS NULL) OR (revision_no > 1 AND supersedes_id IS NOT NULL)),
 CHECK(supersedes_id IS DISTINCT FROM id),
 CHECK((nothing_changed AND cardinality(topics) = 0)
    OR (NOT nothing_changed AND cardinality(topics) > 0))
);
CREATE TABLE review_validation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 review_id uuid NOT NULL UNIQUE REFERENCES health_review,
 decision text NOT NULL CHECK(decision IN ('validated','returned')),
 validator_id uuid NOT NULL REFERENCES app_user,
 decided_at timestamptz NOT NULL DEFAULT now(),
 comment text NOT NULL CHECK(btrim(comment) <> '')
);
CREATE TABLE review_draft (
 cycle_id uuid NOT NULL REFERENCES review_cycle,
 author_id uuid NOT NULL REFERENCES app_user,
 payload jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(payload) = 'object'),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(cycle_id,author_id)
);
CREATE TABLE rule_set (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version text NOT NULL UNIQUE,
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition) = 'object'),
 engine_version text NOT NULL,
 created_by uuid NOT NULL REFERENCES app_user,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE health_assessment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 baseline_id uuid NOT NULL,
 rule_set_id uuid NOT NULL REFERENCES rule_set,
 review_id uuid,
 cycle_id uuid,
 effective_on date NOT NULL,
 calculated_at timestamptz NOT NULL DEFAULT now(),
 project_revision bigint NOT NULL CHECK(project_revision > 0),
 assessment_kind text NOT NULL CHECK(assessment_kind IN ('operational','cycle','retrospective')),
 publication text NOT NULL CHECK(publication IN ('provisional','official')),
 score numeric(5,2) CHECK(score BETWEEN 0 AND 100),
 weighted_score numeric(5,2) CHECK(weighted_score BETWEEN 0 AND 100),
 gate_cap numeric(5,2) CHECK(gate_cap BETWEEN 0 AND 100),
 confidence numeric(5,2) NOT NULL CHECK(confidence BETWEEN 0 AND 100),
 dimension_results jsonb NOT NULL CHECK(jsonb_typeof(dimension_results) = 'object'),
 gate_results jsonb NOT NULL CHECK(jsonb_typeof(gate_results) = 'array'),
 input_snapshot jsonb NOT NULL CHECK(jsonb_typeof(input_snapshot) = 'object'),
 forecast jsonb NOT NULL CHECK(jsonb_typeof(forecast) = 'object'),
 idempotency_key text NOT NULL UNIQUE,
 UNIQUE(project_id,id),
 FOREIGN KEY(project_id,baseline_id) REFERENCES baseline(project_id,id),
 FOREIGN KEY(project_id,review_id) REFERENCES health_review(project_id,id),
 FOREIGN KEY(project_id,cycle_id,review_id) REFERENCES health_review(project_id,cycle_id,id),
 FOREIGN KEY(project_id,cycle_id) REFERENCES review_cycle(project_id,id),
 CHECK(review_id IS NULL OR cycle_id IS NOT NULL),
 CHECK(assessment_kind <> 'cycle' OR cycle_id IS NOT NULL),
 CHECK((score IS NULL AND weighted_score IS NULL AND gate_cap IS NULL)
   OR (score IS NOT NULL AND weighted_score IS NOT NULL AND gate_cap IS NOT NULL
       AND score = least(weighted_score,gate_cap)))
);
CREATE TABLE health_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 rule_key text NOT NULL,
 condition_key text NOT NULL,
 episode integer NOT NULL CHECK(episode > 0),
 severity text NOT NULL CHECK(severity IN ('info','warning','critical')),
 title text NOT NULL,
 milestone_id uuid,
 risk_id uuid,
 renewal_id uuid,
 change_id uuid,
 cycle_id uuid,
 opened_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz,
 resolution_note text,
 UNIQUE(project_id,id),
 UNIQUE(project_id,condition_key,episode),
 FOREIGN KEY(project_id,milestone_id) REFERENCES milestone(project_id,id),
 FOREIGN KEY(project_id,risk_id) REFERENCES risk(project_id,id),
 FOREIGN KEY(project_id,renewal_id) REFERENCES renewal(project_id,id),
 FOREIGN KEY(project_id,change_id) REFERENCES project_change(project_id,id),
 FOREIGN KEY(project_id,cycle_id) REFERENCES review_cycle(project_id,id),
 CHECK(num_nonnulls(milestone_id,risk_id,renewal_id,change_id,cycle_id) <= 1),
 CHECK(resolved_at IS NULL OR (resolved_at >= opened_at AND resolution_note IS NOT NULL))
);
CREATE UNIQUE INDEX one_open_event_per_condition
 ON health_event(project_id,condition_key) WHERE resolved_at IS NULL;
CREATE TABLE health_task (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 event_id uuid,
 title text NOT NULL,
 description text NOT NULL DEFAULT '',
 owner_id uuid NOT NULL REFERENCES app_user,
 due_on date NOT NULL,
 priority text NOT NULL CHECK(priority IN ('high','medium','low')),
 status text NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','in_progress','blocked','completed','cancelled')),
 automatic boolean NOT NULL DEFAULT false,
 automation_key text,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid REFERENCES app_user,
 closed_at timestamptz,
 closure_note text,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 UNIQUE(project_id,id),
 UNIQUE(project_id,automation_key),
 FOREIGN KEY(project_id,event_id) REFERENCES health_event(project_id,id),
 CHECK(NOT automatic OR (event_id IS NOT NULL AND automation_key IS NOT NULL)),
 CHECK((status IN ('completed','cancelled') AND closed_at IS NOT NULL
         AND closure_note IS NOT NULL AND btrim(closure_note) <> '')
    OR (status NOT IN ('completed','cancelled') AND closed_at IS NULL)),
 CHECK(closed_at IS NULL OR closed_at >= created_at)
);
CREATE TABLE activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 milestone_id uuid,
 risk_id uuid,
 task_id uuid,
 actor_id uuid REFERENCES app_user,
 source text NOT NULL CHECK(source IN ('user','system')),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 note text NOT NULL CHECK(btrim(note) <> ''),
 before_data jsonb NOT NULL CHECK(jsonb_typeof(before_data) = 'object'),
 after_data jsonb NOT NULL CHECK(jsonb_typeof(after_data) = 'object'),
 FOREIGN KEY(project_id,milestone_id) REFERENCES milestone(project_id,id),
 FOREIGN KEY(project_id,risk_id) REFERENCES risk(project_id,id),
 FOREIGN KEY(project_id,task_id) REFERENCES health_task(project_id,id),
 CHECK(num_nonnulls(milestone_id,risk_id,task_id) = 1),
 CHECK(source <> 'user' OR actor_id IS NOT NULL)
);
CREATE TABLE evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES project,
 milestone_id uuid,
 risk_id uuid,
 review_id uuid,
 task_id uuid,
 change_id uuid,
 uploaded_by uuid NOT NULL REFERENCES app_user,
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 body_text text,
 object_key text UNIQUE,
 original_filename text,
 mime_type text,
 size_bytes bigint CHECK(size_bytes > 0),
 sha256 text CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 FOREIGN KEY(project_id,milestone_id) REFERENCES milestone(project_id,id),
 FOREIGN KEY(project_id,risk_id) REFERENCES risk(project_id,id),
 FOREIGN KEY(project_id,review_id) REFERENCES health_review(project_id,id),
 FOREIGN KEY(project_id,task_id) REFERENCES health_task(project_id,id),
 FOREIGN KEY(project_id,change_id) REFERENCES project_change(project_id,id),
 CHECK(num_nonnulls(milestone_id,risk_id,review_id,task_id,change_id) = 1),
 CHECK((body_text IS NOT NULL AND btrim(body_text) <> '') OR object_key IS NOT NULL),
 CHECK(object_key IS NULL OR (mime_type IS NOT NULL AND size_bytes IS NOT NULL
     AND sha256 IS NOT NULL AND original_filename IS NOT NULL))
);
CREATE TABLE audit_entry (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 project_id uuid REFERENCES project,
 actor_id uuid REFERENCES app_user,
 request_id uuid NOT NULL,
 action text NOT NULL,
 entity_type text NOT NULL,
 entity_id text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 before_data jsonb,
 after_data jsonb
);
CREATE TABLE outbox_message (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid REFERENCES project,
 event_type text NOT NULL,
 deduplication_key text NOT NULL UNIQUE,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload) = 'object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 available_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts >= 0),
 locked_until timestamptz,
 processed_at timestamptz,
 last_error text
);
CREATE TABLE notification_delivery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 outbox_id uuid NOT NULL REFERENCES outbox_message,
 recipient_id uuid NOT NULL REFERENCES app_user,
 channel text NOT NULL CHECK(channel IN ('in_app','email')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
 provider_reference text,
 sent_at timestamptz,
 read_at timestamptz,
 UNIQUE(outbox_id,recipient_id,channel),
 CHECK((status = 'sent') = (sent_at IS NOT NULL))
);

-- Reject alteration/removal of submitted business history.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['financial_observation','project_change','change_decision',
  'baseline','health_review','review_validation','rule_set','health_assessment',
  'activity','evidence','audit_entry'] LOOP
  EXECUTE format('CREATE TRIGGER immutable_history BEFORE UPDATE OR DELETE ON phs.%I FOR EACH ROW EXECUTE FUNCTION phs.reject_history_mutation()',t);
 END LOOP;
END $$;
CREATE FUNCTION validate_baseline_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_version integer;
BEGIN
 IF NEW.previous_baseline_id IS NOT NULL THEN
  SELECT version INTO previous_version FROM phs.baseline
   WHERE id = NEW.previous_baseline_id AND project_id = NEW.project_id;
  IF previous_version IS NULL OR NEW.version <> previous_version + 1 THEN
   RAISE EXCEPTION 'Baseline versions must be consecutive' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER baseline_chain BEFORE INSERT ON baseline
 FOR EACH ROW EXECUTE FUNCTION validate_baseline_chain();

CREATE INDEX project_practice_status ON project(practice_id,status);
CREATE INDEX project_pm ON project(pm_id);
CREATE INDEX project_lead ON project(lead_id);
CREATE INDEX project_client ON project(client_id);
CREATE INDEX milestone_due ON milestone(project_id,due_on)
 WHERE status NOT IN ('completed','cancelled');
CREATE INDEX risk_due ON risk(project_id,mitigation_due_on)
 WHERE status NOT IN ('mitigated','closed');
CREATE INDEX renewal_due ON renewal(project_id,due_on) WHERE status = 'pending';
CREATE INDEX finance_latest ON financial_observation(project_id,effective_on DESC,recorded_at DESC);
CREATE INDEX review_cycle_due ON review_cycle(due_on,project_id);
CREATE INDEX review_latest ON health_review(project_id,submitted_at DESC);
CREATE INDEX assessment_latest ON health_assessment(project_id,publication,effective_on DESC,project_revision DESC,calculated_at DESC);
CREATE INDEX task_inbox ON health_task(owner_id,due_on)
 WHERE status NOT IN ('completed','cancelled');
CREATE INDEX task_project ON health_task(project_id,status);
CREATE INDEX activity_timeline ON activity(project_id,occurred_at DESC);
CREATE INDEX evidence_project ON evidence(project_id);
CREATE INDEX audit_timeline ON audit_entry(project_id,occurred_at DESC);
CREATE INDEX outbox_pending ON outbox_message(available_at) WHERE processed_at IS NULL;
CREATE INDEX notification_inbox ON notification_delivery(recipient_id,status);
-- dbmate records the migration in the current schema; restore the default before it does.
RESET search_path;

-- migrate:down
-- No destructive rollback: recover with a forward migration or a restored backup.
DO $$ BEGIN RAISE EXCEPTION 'This migration has no down step'; END $$;
