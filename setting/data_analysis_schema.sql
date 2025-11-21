--
-- PostgreSQL database dump
--

\restrict idiHFiRbCRu3DNOG1L5uy9SvbA1Gs9hJHAx5k33TDvOaon5vM4DdCYmYSq0IU4u

-- Dumped from database version 16.9 (Homebrew)
-- Dumped by pg_dump version 16.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: notificationtype; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notificationtype AS ENUM (
    'PROJECT_ADDED',
    'PROJECT_UPDATED',
    'PROJECT_DELETED',
    'MEMBER_ADDED',
    'MEMBER_REMOVED',
    'COMMENT_ADDED',
    'RUN_COMPLETED',
    'RUN_FAILED',
    'artifact_comment_added',
    'ARTIFACT_COMMENT_ADDED'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'OWNER',
    'EDITOR',
    'VIEWER',
    'member',
    'watcher'
);


--
-- Name: runstatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.runstatus AS ENUM (
    'QUEUED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'CANCELED'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: app_setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_setting (
    k character varying NOT NULL,
    v text
);


--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id uuid NOT NULL,
    email character varying,
    password_hash character varying,
    is_admin boolean,
    is_guest boolean,
    created_at timestamp with time zone DEFAULT now(),
    last_login timestamp with time zone,
    display_name character varying,
    department_id uuid,
    business_group_id uuid
);


--
-- Name: artifact; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artifact (
    id uuid NOT NULL,
    project_id uuid,
    run_id uuid,
    kind character varying NOT NULL,
    storage_key character varying NOT NULL,
    filename character varying NOT NULL,
    size_bytes bigint,
    mime_type character varying,
    sha256 character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: artifact_comment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.artifact_comment (
    id uuid NOT NULL,
    artifact_id uuid,
    user_id uuid,
    parent_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: project; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project (
    id uuid NOT NULL,
    name character varying NOT NULL,
    description text,
    owner_id uuid,
    allow_guest boolean,
    is_public boolean,
    created_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone,
    plugin_name character varying
);


--
-- Name: run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run (
    id uuid NOT NULL,
    project_id uuid,
    started_by uuid,
    status public.runstatus NOT NULL,
    task_name character varying,
    jmp_task_id character varying,
    message text,
    image_count bigint,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    deleted_at timestamp with time zone
);


--
-- Name: artifact_with_project_info; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.artifact_with_project_info AS
 SELECT a.id AS artifact_id,
    a.run_id,
    r.project_id,
    p.name AS project_name,
    p.owner_id,
    u.email AS owner_email,
    a.kind,
    a.storage_key,
    a.filename,
    a.size_bytes,
    a.mime_type,
    a.sha256,
    a.created_at
   FROM (((public.artifact a
     LEFT JOIN public.run r ON ((a.run_id = r.id)))
     LEFT JOIN public.project p ON ((r.project_id = p.id)))
     LEFT JOIN public.app_user u ON ((p.owner_id = u.id)));


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    user_id uuid,
    action character varying NOT NULL,
    target character varying,
    meta text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: business_group; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_group (
    id uuid NOT NULL,
    name character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: department; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department (
    id uuid NOT NULL,
    name character varying NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification (
    id uuid NOT NULL,
    user_id uuid,
    type public.notificationtype NOT NULL,
    title character varying NOT NULL,
    message text NOT NULL,
    project_id uuid,
    is_read boolean,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: project_attachment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_attachment (
    id uuid NOT NULL,
    project_id uuid,
    uploaded_by uuid,
    filename character varying NOT NULL,
    description text NOT NULL,
    storage_key character varying NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: project_comment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_comment (
    id uuid NOT NULL,
    project_id uuid,
    user_id uuid,
    parent_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: project_member; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_member (
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying NOT NULL,
    role_id uuid NOT NULL
);


--
-- Name: project_role; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_role (
    id uuid NOT NULL,
    name character varying NOT NULL,
    display_name character varying NOT NULL,
    description text,
    permissions json,
    is_system_role boolean,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: run_comment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.run_comment (
    id uuid NOT NULL,
    run_id uuid,
    user_id uuid,
    parent_id uuid,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    deleted_at timestamp with time zone
);


--
-- Name: run_with_project_info; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.run_with_project_info AS
 SELECT r.id AS run_id,
    r.project_id,
    p.name AS project_name,
    p.owner_id,
    u.email AS owner_email,
    r.started_by,
    r.status,
    r.task_name,
    r.jmp_task_id,
    r.message,
    r.image_count,
    r.created_at,
    r.started_at,
    r.finished_at,
    r.deleted_at
   FROM ((public.run r
     LEFT JOIN public.project p ON ((r.project_id = p.id)))
     LEFT JOIN public.app_user u ON ((p.owner_id = u.id)));


--
-- Name: share_link; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_link (
    id uuid NOT NULL,
    project_id uuid,
    created_by uuid,
    can_download boolean,
    expires_at timestamp with time zone,
    token character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: app_setting app_setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_setting
    ADD CONSTRAINT app_setting_pkey PRIMARY KEY (k);


--
-- Name: app_user app_user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_email_key UNIQUE (email);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: artifact_comment artifact_comment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact_comment
    ADD CONSTRAINT artifact_comment_pkey PRIMARY KEY (id);


--
-- Name: artifact artifact_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact
    ADD CONSTRAINT artifact_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: business_group business_group_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_group
    ADD CONSTRAINT business_group_name_key UNIQUE (name);


--
-- Name: business_group business_group_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_group
    ADD CONSTRAINT business_group_pkey PRIMARY KEY (id);


--
-- Name: department department_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_name_key UNIQUE (name);


--
-- Name: department department_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department
    ADD CONSTRAINT department_pkey PRIMARY KEY (id);


--
-- Name: notification notification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_pkey PRIMARY KEY (id);


--
-- Name: project_attachment project_attachment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_attachment
    ADD CONSTRAINT project_attachment_pkey PRIMARY KEY (id);


--
-- Name: project_comment project_comment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comment
    ADD CONSTRAINT project_comment_pkey PRIMARY KEY (id);


--
-- Name: project_member project_member_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_member
    ADD CONSTRAINT project_member_pkey PRIMARY KEY (project_id, user_id);


--
-- Name: project project_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project
    ADD CONSTRAINT project_pkey PRIMARY KEY (id);


--
-- Name: project_role project_role_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_role
    ADD CONSTRAINT project_role_name_key UNIQUE (name);


--
-- Name: project_role project_role_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_role
    ADD CONSTRAINT project_role_pkey PRIMARY KEY (id);


--
-- Name: run_comment run_comment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_comment
    ADD CONSTRAINT run_comment_pkey PRIMARY KEY (id);


--
-- Name: run run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run
    ADD CONSTRAINT run_pkey PRIMARY KEY (id);


--
-- Name: share_link share_link_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_link
    ADD CONSTRAINT share_link_pkey PRIMARY KEY (id);


--
-- Name: share_link share_link_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_link
    ADD CONSTRAINT share_link_token_key UNIQUE (token);


--
-- Name: app_user app_user_business_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_business_group_id_fkey FOREIGN KEY (business_group_id) REFERENCES public.business_group(id);


--
-- Name: app_user app_user_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.department(id);


--
-- Name: artifact_comment artifact_comment_artifact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact_comment
    ADD CONSTRAINT artifact_comment_artifact_id_fkey FOREIGN KEY (artifact_id) REFERENCES public.artifact(id) ON DELETE CASCADE;


--
-- Name: artifact_comment artifact_comment_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact_comment
    ADD CONSTRAINT artifact_comment_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.artifact_comment(id);


--
-- Name: artifact_comment artifact_comment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact_comment
    ADD CONSTRAINT artifact_comment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id);


--
-- Name: artifact artifact_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact
    ADD CONSTRAINT artifact_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE;


--
-- Name: artifact artifact_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.artifact
    ADD CONSTRAINT artifact_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.run(id) ON DELETE CASCADE;


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id);


--
-- Name: notification notification_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE;


--
-- Name: notification notification_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification
    ADD CONSTRAINT notification_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: project_attachment project_attachment_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_attachment
    ADD CONSTRAINT project_attachment_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE;


--
-- Name: project_attachment project_attachment_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_attachment
    ADD CONSTRAINT project_attachment_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: project_comment project_comment_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comment
    ADD CONSTRAINT project_comment_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.project_comment(id);


--
-- Name: project_comment project_comment_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comment
    ADD CONSTRAINT project_comment_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE;


--
-- Name: project_comment project_comment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_comment
    ADD CONSTRAINT project_comment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id);


--
-- Name: project_member project_member_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_member
    ADD CONSTRAINT project_member_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE;


--
-- Name: project_member project_member_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_member
    ADD CONSTRAINT project_member_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.project_role(id);


--
-- Name: project_member project_member_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_member
    ADD CONSTRAINT project_member_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id) ON DELETE CASCADE;


--
-- Name: project project_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project
    ADD CONSTRAINT project_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.app_user(id);


--
-- Name: run_comment run_comment_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_comment
    ADD CONSTRAINT run_comment_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.run_comment(id);


--
-- Name: run_comment run_comment_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_comment
    ADD CONSTRAINT run_comment_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.run(id) ON DELETE CASCADE;


--
-- Name: run_comment run_comment_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run_comment
    ADD CONSTRAINT run_comment_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_user(id);


--
-- Name: run run_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run
    ADD CONSTRAINT run_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE;


--
-- Name: run run_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.run
    ADD CONSTRAINT run_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.app_user(id);


--
-- Name: share_link share_link_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_link
    ADD CONSTRAINT share_link_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_user(id);


--
-- Name: share_link share_link_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_link
    ADD CONSTRAINT share_link_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.project(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict idiHFiRbCRu3DNOG1L5uy9SvbA1Gs9hJHAx5k33TDvOaon5vM4DdCYmYSq0IU4u

