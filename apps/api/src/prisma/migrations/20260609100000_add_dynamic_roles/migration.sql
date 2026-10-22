-- CreateTable: Role
CREATE TABLE "Role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RolePermission
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roleId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
CREATE UNIQUE INDEX "Role_slug_key" ON "Role"("slug");
CREATE UNIQUE INDEX "RolePermission_roleId_action_subject_key" ON "RolePermission"("roleId", "action", "subject");
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- AddColumn: User.roleId (nullable for migration)
ALTER TABLE "User" ADD COLUMN "roleId" UUID;

-- AddColumn: UserInvitation.roleId (nullable for migration)
ALTER TABLE "UserInvitation" ADD COLUMN "roleId" UUID;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- Data Migration: Create Role records from UserRole enum values
-- ============================================================================

INSERT INTO "Role" ("id", "name", "slug", "isSystem", "description", "createdAt", "updatedAt") VALUES
    (gen_random_uuid(), 'Administrator',    'administrator',    true,  'Acces complet la toate resursele',                    NOW(), NOW()),
    (gen_random_uuid(), 'Sef Laborator',    'sef-laborator',    true,  'Gestioneaza laboratorul, retete si taskuri',           NOW(), NOW()),
    (gen_random_uuid(), 'Sef Evenimente',   'sef-evenimente',   true,  'Gestioneaza comenzi si evenimente',                   NOW(), NOW()),
    (gen_random_uuid(), 'Cofetar',          'cofetar',          true,  'Produce retete, gestioneaza taskuri',                  NOW(), NOW()),
    (gen_random_uuid(), 'Patiser',          'patiser',          true,  'Produce retete de patiserie, gestioneaza taskuri',     NOW(), NOW()),
    (gen_random_uuid(), 'Ajutor Cofetar',   'ajutor-cofetar',   true,  'Asistenta productie, acces limitat',                  NOW(), NOW()),
    (gen_random_uuid(), 'Magazioner',       'magazioner',       true,  'Gestioneaza stocuri, locatii si transferuri',          NOW(), NOW());

-- ============================================================================
-- Data Migration: Create RolePermission records matching CASL rules
-- ============================================================================

-- Administrator: manage all
INSERT INTO "RolePermission" ("id", "roleId", "action", "subject")
SELECT gen_random_uuid(), r."id", 'manage', 'all'
FROM "Role" r WHERE r."slug" = 'administrator';

-- Sef Laborator
INSERT INTO "RolePermission" ("id", "roleId", "action", "subject")
SELECT gen_random_uuid(), r."id", a.action, a.subject
FROM "Role" r,
(VALUES
    ('read', 'Recipe'), ('create', 'Recipe'), ('update', 'Recipe'),
    ('read', 'RawMaterial'), ('read', 'Consumable'),
    ('read', 'Task'), ('create', 'Task'), ('update', 'Task'),
    ('read', 'StockMovement'), ('read', 'StockReservation'),
    ('read', 'Order'),
    ('read', 'Location'), ('read', 'StockTransfer'), ('create', 'StockTransfer')
) AS a(action, subject)
WHERE r."slug" = 'sef-laborator';

-- Sef Evenimente
INSERT INTO "RolePermission" ("id", "roleId", "action", "subject")
SELECT gen_random_uuid(), r."id", a.action, a.subject
FROM "Role" r,
(VALUES
    ('read', 'Recipe'), ('create', 'Recipe'), ('update', 'Recipe'),
    ('read', 'RawMaterial'), ('read', 'Consumable'),
    ('read', 'Task'), ('create', 'Task'),
    ('read', 'StockMovement'),
    ('create', 'Order'), ('read', 'Order'), ('update', 'Order'),
    ('create', 'OrderItem'), ('read', 'OrderItem'),
    ('read', 'DeliveryNote'), ('create', 'DeliveryNote'),
    ('read', 'Location'), ('read', 'StockTransfer')
) AS a(action, subject)
WHERE r."slug" = 'sef-evenimente';

-- Cofetar
INSERT INTO "RolePermission" ("id", "roleId", "action", "subject")
SELECT gen_random_uuid(), r."id", a.action, a.subject
FROM "Role" r,
(VALUES
    ('read', 'Recipe'),
    ('read', 'RawMaterial'), ('read', 'Consumable'),
    ('read', 'Task'), ('create', 'Task'), ('update', 'Task'),
    ('read', 'StockMovement'),
    ('read', 'Order'),
    ('read', 'Location'), ('read', 'StockTransfer')
) AS a(action, subject)
WHERE r."slug" = 'cofetar';

-- Patiser
INSERT INTO "RolePermission" ("id", "roleId", "action", "subject")
SELECT gen_random_uuid(), r."id", a.action, a.subject
FROM "Role" r,
(VALUES
    ('read', 'Recipe'),
    ('read', 'RawMaterial'), ('read', 'Consumable'),
    ('read', 'Task'), ('create', 'Task'), ('update', 'Task'),
    ('read', 'StockMovement'),
    ('read', 'Order'),
    ('read', 'Location'), ('read', 'StockTransfer')
) AS a(action, subject)
WHERE r."slug" = 'patiser';

-- Ajutor Cofetar
INSERT INTO "RolePermission" ("id", "roleId", "action", "subject")
SELECT gen_random_uuid(), r."id", a.action, a.subject
FROM "Role" r,
(VALUES
    ('read', 'Recipe'),
    ('read', 'RawMaterial'),
    ('read', 'Task')
) AS a(action, subject)
WHERE r."slug" = 'ajutor-cofetar';

-- Magazioner
INSERT INTO "RolePermission" ("id", "roleId", "action", "subject")
SELECT gen_random_uuid(), r."id", a.action, a.subject
FROM "Role" r,
(VALUES
    ('read', 'RawMaterial'), ('create', 'RawMaterial'), ('update', 'RawMaterial'),
    ('read', 'Consumable'), ('create', 'Consumable'), ('update', 'Consumable'),
    ('read', 'StockMovement'), ('create', 'StockMovement'),
    ('read', 'Task'),
    ('read', 'Recipe'),
    ('read', 'Order'),
    ('manage', 'Location'), ('manage', 'StockTransfer')
) AS a(action, subject)
WHERE r."slug" = 'magazioner';

-- ============================================================================
-- Data Migration: Link existing users to new Role records via roleId
-- ============================================================================

UPDATE "User" u SET "roleId" = r."id"
FROM "Role" r
WHERE (u."role" = 'ADMINISTRATOR'   AND r."slug" = 'administrator')
   OR (u."role" = 'SEF_LABORATOR'   AND r."slug" = 'sef-laborator')
   OR (u."role" = 'SEF_EVENIMENTE'  AND r."slug" = 'sef-evenimente')
   OR (u."role" = 'COFETAR'         AND r."slug" = 'cofetar')
   OR (u."role" = 'PATISER'         AND r."slug" = 'patiser')
   OR (u."role" = 'AJUTOR_COFETAR'  AND r."slug" = 'ajutor-cofetar')
   OR (u."role" = 'MAGAZIONER'      AND r."slug" = 'magazioner');

-- Link existing invitations to new Role records via roleId
UPDATE "UserInvitation" ui SET "roleId" = r."id"
FROM "Role" r
WHERE (ui."role" = 'ADMINISTRATOR'   AND r."slug" = 'administrator')
   OR (ui."role" = 'SEF_LABORATOR'   AND r."slug" = 'sef-laborator')
   OR (ui."role" = 'SEF_EVENIMENTE'  AND r."slug" = 'sef-evenimente')
   OR (ui."role" = 'COFETAR'         AND r."slug" = 'cofetar')
   OR (ui."role" = 'PATISER'         AND r."slug" = 'patiser')
   OR (ui."role" = 'AJUTOR_COFETAR'  AND r."slug" = 'ajutor-cofetar')
   OR (ui."role" = 'MAGAZIONER'      AND r."slug" = 'magazioner');
