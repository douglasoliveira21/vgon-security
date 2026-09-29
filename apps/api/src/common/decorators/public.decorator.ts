import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// Marks an endpoint as not requiring the web-user JWT guard (e.g. login, agent registration).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
