export const WORKSPACE_IDS = {
  passengerStaging: 'ws_passenger_staging',
  passengerProduction: 'ws_passenger_production',
  driverStaging: 'ws_driver_staging',
  driverProduction: 'ws_driver_production',
} as const;

export const LIST_IDS = {
  psAll: 'list_ps_all',
  psVip: 'list_ps_vip',
  psEmpty: 'list_ps_empty',
  psArchived: 'list_ps_archived',
  ppAll: 'list_pp_all',
  ppWeekly: 'list_pp_weekly',
  dsAll: 'list_ds_all',
  dsOnline: 'list_ds_online',
  dpAll: 'list_dp_all',
} as const;

export const TEMPLATE_IDS = {
  psWelcome: 'tplv_ps_welcome_1',
  psReminder: 'tplv_ps_reminder_2',
  psPromo: 'tplv_ps_promo_1',
  psEmpty: 'tplv_ps_empty_1',
  psDeleted: 'tplv_ps_deleted_1',
  ppWelcome: 'tplv_pp_welcome_1',
  dsWelcome: 'tplv_ds_welcome_1',
  dpAnnouncement: 'tplv_dp_announcement_1',
} as const;

export const JOURNEY_IDS = {
  psOnboarding: 'journey_ps_onboarding',
  ppReactivation: 'journey_pp_reactivation',
  dsShift: 'journey_ds_shift',
  dpAnnouncement: 'journey_dp_announcement',
} as const;
