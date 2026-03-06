-- CreateTable
CREATE TABLE "BundleGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bundleName" TEXT NOT NULL,
    "bundleHeading" TEXT NOT NULL DEFAULT '',
    "bundleSubHeading" TEXT NOT NULL DEFAULT '',
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
