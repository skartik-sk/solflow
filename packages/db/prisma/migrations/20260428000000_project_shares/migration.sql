CREATE TABLE "ProjectShare" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "flowData" JSONB NOT NULL,
    "irData" JSONB,
    "auditSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectShare_slug_key" ON "ProjectShare"("slug");
CREATE INDEX "ProjectShare_projectId_idx" ON "ProjectShare"("projectId");
CREATE INDEX "ProjectShare_userId_idx" ON "ProjectShare"("userId");
CREATE INDEX "ProjectShare_revokedAt_idx" ON "ProjectShare"("revokedAt");

ALTER TABLE "ProjectShare" ADD CONSTRAINT "ProjectShare_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectShare" ADD CONSTRAINT "ProjectShare_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
