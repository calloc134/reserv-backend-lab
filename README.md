# 部室予約システム バックエンド

## 概要

開発した部室予約システムのバックエンドです。

詳細は以下からご確認ください。
[https://zenn.dev/calloc134/articles/c24167f2fb6921](https://zenn.dev/calloc134/articles/c24167f2fb6921)

## 利用技術

- Hono
- Neon Database
- SafeQL
- Cloudflare Workers, Wrangler
- neverthrow

## ディレクトリ構成

src ディレクトリを以下の構成に分割しています。

詳細は以下のとおりです。

```
src
├── domain (ドメイン層)
│   ├── User.ts (ユーザエンティティ)
│   ├── Room.ts (部室エンティティ)
│   ├── ReservationOrDisabledForDelete.ts (削除用の予約または利用禁止エンティティ)
│   ├── ReservationOrDisabledWithRoom.ts (部室情報を含む予約または利用禁止エンティティ)
│   ├── NameValue.ts (名前の値オブジェクト)
│   ├── SlotValue.ts (時間帯の値オブジェクト)
│   ├── UserIdValue.ts (ユーザIDの値オブジェクト)
│   └── UuidValue.ts (UUIDの値オブジェクト)
├─── types (型定義)
│   └── dto (DTO)
│       ├── ReservationResponse.ts
│       └── RoomResponse.ts
├── repositories (リポジトリ層)
│   ├── reservation_or_disabled (予約または利用禁止リポジトリ)
│   │   ├── createDisabled.ts
│   │   ├── createReservation.ts
│   │   ├── deleteReservationByRordId.ts
│   │   ├── existsReservationByDateRangeUserId.ts
│   │   ├── existsReservationByDateSlotRoomId.ts
│   │   ├── findReservationByDateRange.ts
│   │   ├── findReservationByDateRangeUserId.ts
│   │   └── findReservationByRordIdForDelete.ts
│   ├── room (部室リポジトリ)
│   │   ├── existsRoomByUuid.ts
│   │   ├── findAvailableRooms.ts
│   │   └── findRooms.ts
│   └── user (ユーザリポジトリ)
│       ├── findByUserId.ts
│       └── findByUserIds.ts
├─ usecase (ユースケース層)
│   ├── reservation_or_disabled (予約または利用禁止ユースケース)
│   │   ├── deleteReservation.ts
│   │   ├── getReservationsByDateRange.ts
│   │   ├── getReservationsByDateRangeUserId.ts
│   │   ├── postReservation.ts
│   │   └── toDisable.ts
│   └── room (部室ユースケース)
│       ├── getAvailableRooms.ts
│       └── getRooms.ts
└── utils (ユーティリティ)
    ├── convertFromDate.ts (日付を文字列に変換)
    ├── convertToDate.ts (文字列を日付に変換)
    ├── getPreviousMonday.ts (直前の月曜日を取得)
    └── isWeekday.ts (平日かどうかを判定)
```

## 気をつけている点

- アーキテクチャの意識
  - クリーンアーキテクチャ風に設計(本質的にはヘキサゴナルに近い？)
  - ハンドラ層、ユースケース層、リポジトリ層、ドメイン層を分離
    - ハンドラ層は専らリクエストレスポンスのエンティティ詰め替えのみ
    - リポジトリはデータベースアクセスとエンティティ詰め替えのみ
      - これにより、ビジネスロジックをユースケース層で追いやすくなる
  - 値オブジェクトに値の知識を持たせる
    - バリデーションに頼らない不正な値の排除
  - 集約はおおよそ以下の通りに分割
    - ユーザ
    - 部室
    - 予約または利用禁止
- エラーハンドリング
  - neverthrow を利用してエラーハンドリングを実施
  - 明示的なエラーハンドリングを意識

## やらなかったこと

- リポジトリと集約ルートの厳密な対応付け
  - 本来はリポジトリと集約ルートを一対一に対応付けるべき
  - 今回は一部の取得に限り、リポジトリで集約外のエンティティの取得を許容
  - CQRS パターンを採用することも考えたが、多くのケースでは必要ないと判断
