import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('ChangeMe123!');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme-demo' },
    update: {},
    create: { name: 'Acme Demo Corp', slug: 'acme-demo' },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'owner@acme-demo.test' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'owner@acme-demo.test',
      name: 'Acme Owner',
      role: 'OWNER',
      passwordHash,
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'analyst@acme-demo.test' } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'analyst@acme-demo.test',
      name: 'Acme Analyst',
      role: 'ANALYST',
      passwordHash,
    },
  });

  const site = await prisma.site.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'HQ' } },
    update: {},
    create: { tenantId: tenant.id, name: 'HQ' },
  });

  console.log('Seed complete:', {
    tenant: tenant.slug,
    site: site.name,
    users: ['owner@acme-demo.test / ChangeMe123!', 'analyst@acme-demo.test / ChangeMe123!'],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
