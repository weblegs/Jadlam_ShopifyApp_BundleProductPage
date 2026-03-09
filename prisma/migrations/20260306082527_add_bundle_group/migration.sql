-- CreateTable
CREATE TABLE "BundleGroup" (
    "id" TEXT NOT NULL,
    "bundleName" TEXT NOT NULL,
    "bundleHeading" TEXT NOT NULL DEFAULT '',
    "bundleSubHeading" TEXT NOT NULL DEFAULT '',
    "handle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleGroup_pkey" PRIMARY KEY ("id")
);
