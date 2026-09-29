import { Module } from '@nestjs/common';
import { PoliciesController } from './policies.controller';
import { PolicyResolverService } from './policy-resolver.service';

@Module({
  controllers: [PoliciesController],
  providers: [PolicyResolverService],
  exports: [PolicyResolverService],
})
export class PoliciesModule {}
