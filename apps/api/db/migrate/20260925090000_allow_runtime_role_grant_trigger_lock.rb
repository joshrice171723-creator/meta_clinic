class AllowRuntimeRoleGrantTriggerLock < ActiveRecord::Migration[8.1]
  def up
    execute "ALTER FUNCTION public.erd_freeze_granted_role() SECURITY DEFINER"
    execute "ALTER FUNCTION public.erd_freeze_granted_role() SET search_path = pg_catalog, public"
  end

  def down
    execute "ALTER FUNCTION public.erd_freeze_granted_role() SECURITY INVOKER"
    execute "ALTER FUNCTION public.erd_freeze_granted_role() RESET search_path"
  end
end
