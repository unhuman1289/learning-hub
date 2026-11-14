UPDATE subjects
SET limits = json_remove(limits, '$.package')
WHERE json_type(limits, '$.package') IS NOT NULL;
