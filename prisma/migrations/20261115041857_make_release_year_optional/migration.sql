-- AlterTable
ALTER TABLE "Movie" ALTER COLUMN "releaseYear" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Movie_normalizedTitle_no_year_key" ON "Movie"("normalizedTitle") WHERE ("releaseYear" IS NULL);

