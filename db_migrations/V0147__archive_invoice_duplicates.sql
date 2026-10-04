UPDATE products SET is_archived = true, updated_at = NOW()
WHERE id IN (20859, 20861, 20864) AND created_from_draft_id = 11 AND external_id IS NULL;