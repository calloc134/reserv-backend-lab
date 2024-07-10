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
-- Name: slot; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.slot AS ENUM (
    'first',
    'second',
    'third',
    'fourth'
);


--
-- Name: status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.status AS ENUM (
    'reserved',
    'disabled'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: reservation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation (
    reservation_uuid uuid NOT NULL,
    user_id character(32) NOT NULL
);


--
-- Name: reservation_or_disabled; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation_or_disabled (
    rord_uuid uuid NOT NULL,
    room_uuid uuid NOT NULL,
    status public.status NOT NULL,
    reservation_uuid uuid,
    date date NOT NULL,
    slot public.slot NOT NULL
);


--
-- Name: room; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room (
    room_uuid uuid NOT NULL,
    name text NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(128) NOT NULL
);


--
-- Name: reservation_or_disabled reservation_or_disabled_date_slot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_or_disabled
    ADD CONSTRAINT reservation_or_disabled_date_slot_key UNIQUE (date, slot);


--
-- Name: reservation_or_disabled reservation_or_disabled_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_or_disabled
    ADD CONSTRAINT reservation_or_disabled_pkey PRIMARY KEY (rord_uuid);


--
-- Name: reservation_or_disabled reservation_or_disabled_reservation_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_or_disabled
    ADD CONSTRAINT reservation_or_disabled_reservation_uuid_key UNIQUE (reservation_uuid);


--
-- Name: reservation reservation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT reservation_pkey PRIMARY KEY (reservation_uuid);


--
-- Name: room room_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room
    ADD CONSTRAINT room_name_key UNIQUE (name);


--
-- Name: room room_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room
    ADD CONSTRAINT room_pkey PRIMARY KEY (room_uuid);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: reservation_or_disabled_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservation_or_disabled_date_idx ON public.reservation_or_disabled USING btree (date);


--
-- Name: reservation_or_disabled_date_slot_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservation_or_disabled_date_slot_idx ON public.reservation_or_disabled USING btree (date, slot);


--
-- Name: reservation_or_disabled_room_uuid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservation_or_disabled_room_uuid_idx ON public.reservation_or_disabled USING btree (room_uuid);


--
-- Name: reservation_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX reservation_user_id_idx ON public.reservation USING btree (user_id);


--
-- Name: reservation_or_disabled reservation_or_disabled_room_uuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_or_disabled
    ADD CONSTRAINT reservation_or_disabled_room_uuid_fkey FOREIGN KEY (room_uuid) REFERENCES public.room(room_uuid) ON DELETE CASCADE;


--
-- Name: reservation reservation_reservation_uuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation
    ADD CONSTRAINT reservation_reservation_uuid_fkey FOREIGN KEY (reservation_uuid) REFERENCES public.reservation_or_disabled(reservation_uuid) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20240704144235'),
    ('20240705042450');
