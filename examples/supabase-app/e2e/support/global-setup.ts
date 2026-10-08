// Before every run: remove test users left behind by runs that never got to clean up.
import { sweepStaleTestUsers } from '../../../../kit/adapters/supabase/sweep.ts';

export default sweepStaleTestUsers();
