-- Camera geometry drawn on the website (Operator -> camera) and applied by the edge without editing config.yaml.
-- exit_line: two normalised points on the inside camera between the seats and the door;
-- door_point: one normalised point on the door side of that line (decides which crossing is OUT);
-- snapshot_at: when the edge last uploaded the snapshot the geometry is drawn on.
alter table public.cameras
  add column exit_line   jsonb,
  add column door_point  jsonb,
  add column snapshot_at timestamptz;
