-- CreateIndex
CREATE INDEX "MessageTemplate_createdById_updatedAt_idx" ON "MessageTemplate"("createdById", "updatedAt");
-- CreateIndex
CREATE INDEX "ContactTemplate_createdById_createdAt_idx" ON "ContactTemplate"("createdById", "createdAt");
