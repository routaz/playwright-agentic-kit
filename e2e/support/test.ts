import { createKitTest } from '../../kit';
import { adapter } from './adapter';

/** Specs import `test` and `expect` from here, never from @playwright/test directly. */
export const test = createKitTest(adapter);
export { expect } from '../../kit';
