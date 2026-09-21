-- Utility for clearing rows out of the `detections` table - the table
-- that feeds BOTH the local "Analisis" history page (for the visitor who
-- ran the analysis) AND, now, the public "Mapa de datos" community layer
-- (GET /api/detections, all users, server-side, PostgreSQL).
--
-- Important distinction, because it's easy to expect one to clear the
-- other: the "Borrar historial" button on the Analisis page only clears
-- the CURRENT BROWSER's localStorage (centinela_analysis_runs) - it never
-- touches this table. So a detection you cleared from your own browser's
-- history can still show up on the public community map, because it's
-- still sitting in this table. To make a detection disappear from that
-- public map, you have to delete its row from here directly.
--
-- How to run this file:
--   Docker:  docker compose exec db psql -U centinela -d centinela_cyl -f /path/to/this/file.sql
--            (or pipe it in: docker compose exec -T db psql -U centinela -d centinela_cyl < clear-detections.sql)
--   Local psql: psql -h localhost -U centinela -d centinela_cyl -f backend/scripts/clear-detections.sql
--
-- Uncomment ONE of the statements below (they're commented out on
-- purpose - this file is meant to be edited before running, not executed
-- blindly) and run it.


-- Option A: wipe every detection ever logged, from every user. Use this
-- if what's showing up on the community map is entirely old test/demo
-- data from development and you want a clean slate.
-- DELETE FROM detections;


-- Option B: wipe only detections created before a given date (useful if
-- you know real detections started at some point and everything before
-- that was testing). Adjust the timestamp.
-- DELETE FROM detections WHERE created_at < '2026-01-01';


-- Option C: wipe only detections below some confidence (e.g. clear out
-- low-confidence noise but keep anything the model was genuinely sure
-- about).
-- DELETE FROM detections WHERE confidence < 0.6;


-- Option D: wipe one specific detection by id (find the id first with a
-- SELECT, e.g. SELECT id, longitude, latitude, confidence, created_at
-- FROM detections ORDER BY created_at DESC LIMIT 50;).
-- DELETE FROM detections WHERE id = 123;


-- After any DELETE above, sanity-check what's left:
-- SELECT count(*), min(created_at), max(created_at) FROM detections;
