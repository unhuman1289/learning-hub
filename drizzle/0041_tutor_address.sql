ALTER TABLE learner_settings ADD COLUMN tutor_self TEXT CHECK(tutor_self IN ('con','em','cháu'));
ALTER TABLE learner_settings ADD COLUMN tutor_call TEXT CHECK(
  length(tutor_call) <= 30 AND instr(tutor_call, char(0)) = 0
  AND instr(tutor_call, char(10)) = 0 AND instr(tutor_call, char(13)) = 0
  AND instr(tutor_call, char(11)) = 0 AND instr(tutor_call, char(12)) = 0
  AND instr(tutor_call, char(133)) = 0 AND instr(tutor_call, char(8232)) = 0 AND instr(tutor_call, char(8233)) = 0
);
