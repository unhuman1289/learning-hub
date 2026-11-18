CREATE TABLE grader_calibration_details (
 calibration_id TEXT NOT NULL REFERENCES grader_calibrations(id),
 fixture_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 expected_result TEXT NOT NULL,
 model_result TEXT,
 fixture_answer TEXT NOT NULL,
 rubric_scores TEXT NOT NULL,
 error_code TEXT,
 PRIMARY KEY(calibration_id,fixture_id,item_id)
);
