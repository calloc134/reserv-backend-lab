-- migrate:up
ALTER TYPE slot ADD VALUE 'fifth';

-- migrate:down
ALTER TYPE slot DROP VALUE 'fifth';
