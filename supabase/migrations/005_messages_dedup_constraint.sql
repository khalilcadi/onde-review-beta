-- Migration 005 — Contrainte unique sur messages(conversation_id, timestamp)
-- Requise par le upsert idempotent du webhook Unipile (Patch 5 audit LinkedIn safety).
-- Empêche l'insertion de doublons si Unipile renvoie le même webhook plusieurs fois.

ALTER TABLE messages
  ADD CONSTRAINT messages_conv_timestamp_unique
  UNIQUE (conversation_id, timestamp);
