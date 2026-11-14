-- AlterTable
ALTER TABLE "Movie" ALTER COLUMN "createdAt" SET DEFAULT now();

-- AlterTable
ALTER TABLE "MovieFact" ALTER COLUMN "createdAt" SET DEFAULT now();

-- AlterTable
ALTER TABLE "UserFavoriteMovie" ALTER COLUMN "createdAt" SET DEFAULT now();
