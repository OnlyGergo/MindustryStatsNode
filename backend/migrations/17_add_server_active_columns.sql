-- Add inactivity_excluded column to servers table
ALTER TABLE servers 
    ADD COLUMN inactivity_excluded BOOLEAN NOT NULL DEFAULT FALSE;