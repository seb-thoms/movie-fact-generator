-- AlterTable
ALTER TABLE "Movie" ALTER COLUMN "createdAt" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "MovieFact" ALTER COLUMN "createdAt" SET DEFAULT transaction_timestamp();

-- AlterTable
ALTER TABLE "UserFavoriteMovie" ALTER COLUMN "createdAt" SET DEFAULT transaction_timestamp();

-- CreateTable
CREATE TABLE "FactDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "movieFactId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT transaction_timestamp(),

    CONSTRAINT "FactDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactGenerationLease" (
    "userId" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "lockedUntil" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FactGenerationLease_pkey" PRIMARY KEY ("userId","movieId")
);

-- CreateIndex
CREATE INDEX "FactDelivery_userId_movieId_deliveredAt_idx" ON "FactDelivery"("userId", "movieId", "deliveredAt" DESC);

-- CreateIndex
CREATE INDEX "FactDelivery_movieFactId_userId_idx" ON "FactDelivery"("movieFactId", "userId");

-- AddForeignKey
ALTER TABLE "FactDelivery" ADD CONSTRAINT "FactDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactDelivery" ADD CONSTRAINT "FactDelivery_movieFactId_movieId_fkey" FOREIGN KEY ("movieFactId", "movieId") REFERENCES "MovieFact"("id", "movieId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactGenerationLease" ADD CONSTRAINT "FactGenerationLease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FactGenerationLease" ADD CONSTRAINT "FactGenerationLease_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
