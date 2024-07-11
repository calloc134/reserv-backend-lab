-- migrate:up
CREATE TYPE slot AS ENUM ('first', 'second', 'third', 'fourth');

CREATE TYPE status AS ENUM ('reserved', 'disabled');

CREATE TABLE room (
  room_uuid UUID PRIMARY KEY NOT NULL,
  name TEXT NOT NULL NOT NULL,
  UNIQUE (name)
);

-- 予約
CREATE TABLE reservation (
  reservation_uuid UUID PRIMARY KEY NOT NULL,
  user_id CHAR(32) NOT NULL
);

-- 直和を表現するための苦肉の策
-- https://qiita.com/nunukim/items/49ad482544da0f622ec4
CREATE TABLE reservation_or_disabled (
  rord_uuid UUID PRIMARY KEY NOT NULL,
  room_uuid UUID NOT NULL,
  status status NOT NULL,
  reservation_uuid UUID,
  date DATE NOT NULL,
  slot slot NOT NULL,
  UNIQUE (date, slot, room_uuid),
  FOREIGN KEY (reservation_uuid) REFERENCES reservation (reservation_uuid) on delete cascade,
  FOREIGN KEY (room_uuid) REFERENCES room (room_uuid) on delete cascade
);



-- ユーザidで検索するためのインデックス
CREATE INDEX ON reservation (user_id);
-- 部屋idで検索するためのインデックス
CREATE INDEX ON reservation_or_disabled (room_uuid);
-- 予約idで検索するためのインデックス
CREATE INDEX ON reservation_or_disabled (reservation_uuid);
-- 予約日と枠で検索するためのインデックス
CREATE INDEX ON reservation_or_disabled (date, slot);


-- migrate:down

DROP TABLE reservation_or_disabled;
DROP TABLE reservation;
DROP TABLE room;
DROP TYPE slot;
DROP TYPE status;