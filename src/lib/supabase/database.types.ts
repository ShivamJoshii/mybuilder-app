
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "app_actions": {
                  Row: {
                    "key": string,"label": string,"module": string
                  }
                  Insert: {
                    "key": string,"label": string,"module": string
                  }
                  Update: {
                    "key"?: string,"label"?: string,"module"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "app_actions_module_fkey"
      columns: ["module"]
isOneToOne: false
      referencedRelation: "app_modules"
      referencedColumns: ["key"]
    }
                  ]
                },"app_modules": {
                  Row: {
                    "area": string,"has_money": boolean,"key": string,"label": string,"sort": number
                  }
                  Insert: {
                    "area": string,"has_money"?: boolean,"key": string,"label": string,"sort": number
                  }
                  Update: {
                    "area"?: string,"has_money"?: boolean,"key"?: string,"label"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"app_notification_types": {
                  Row: {
                    "default_email": boolean,"default_push": boolean,"default_text": boolean,"grp": string,"key": string,"label": string,"module": string,"sort": number
                  }
                  Insert: {
                    "default_email"?: boolean,"default_push"?: boolean,"default_text"?: boolean,"grp": string,"key": string,"label": string,"module": string,"sort": number
                  }
                  Update: {
                    "default_email"?: boolean,"default_push"?: boolean,"default_text"?: boolean,"grp"?: string,"key"?: string,"label"?: string,"module"?: string,"sort"?: number
                  }
                  Relationships: [
                    
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"at": string,"before": Json | null,"id": number,"org_id": string | null,"record_id": string,"table_name": string
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: never,"org_id"?: string | null,"record_id": string,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: never,"org_id"?: string | null,"record_id"?: string,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"builder_sub_links": {
                  Row: {
                    "builder_org_id": string,"business_phone": string | null,"cell_phone": string | null,"city": string | null,"company_name": string,"created_at": string,"custom": NonNullable<Json>,"fax": string | null,"id": string,"postal_code": string | null,"primary_contact_first": string | null,"primary_contact_last": string | null,"primary_email": string | null,"province": string | null,"sms_opt_in": boolean,"status": Database["public"]['Enums']["link_status"],"street": string | null,"sub_org_id": string,"trade": string | null,"updated_at": string
                  }
                  Insert: {
                    "builder_org_id": string,"business_phone"?: string | null,"cell_phone"?: string | null,"city"?: string | null,"company_name": string,"created_at"?: string,"custom"?: NonNullable<Json>,"fax"?: string | null,"id"?: string,"postal_code"?: string | null,"primary_contact_first"?: string | null,"primary_contact_last"?: string | null,"primary_email"?: string | null,"province"?: string | null,"sms_opt_in"?: boolean,"status"?: Database["public"]['Enums']["link_status"],"street"?: string | null,"sub_org_id": string,"trade"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "builder_org_id"?: string,"business_phone"?: string | null,"cell_phone"?: string | null,"city"?: string | null,"company_name"?: string,"created_at"?: string,"custom"?: NonNullable<Json>,"fax"?: string | null,"id"?: string,"postal_code"?: string | null,"primary_contact_first"?: string | null,"primary_contact_last"?: string | null,"primary_email"?: string | null,"province"?: string | null,"sms_opt_in"?: boolean,"status"?: Database["public"]['Enums']["link_status"],"street"?: string | null,"sub_org_id"?: string,"trade"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "builder_sub_links_builder_org_id_fkey"
      columns: ["builder_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "builder_sub_links_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"client_permission_defaults": {
                  Row: {
                    "org_id": string,"settings": NonNullable<Json>
                  }
                  Insert: {
                    "org_id": string,"settings"?: NonNullable<Json>
                  }
                  Update: {
                    "org_id"?: string,"settings"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "client_permission_defaults_org_id_fkey"
      columns: ["org_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"author_type": string,"body": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"job_id": string,"org_id": string,"parent_id": string | null,"record_id": string,"record_type": string,"visible_to_clients": boolean,"visible_to_subs": boolean
                  }
                  Insert: {
                    "author_id": string,"author_type": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"job_id": string,"org_id": string,"parent_id"?: string | null,"record_id": string,"record_type": string,"visible_to_clients"?: boolean,"visible_to_subs"?: boolean
                  }
                  Update: {
                    "author_id"?: string,"author_type"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"job_id"?: string,"org_id"?: string,"parent_id"?: string | null,"record_id"?: string,"record_type"?: string,"visible_to_clients"?: boolean,"visible_to_subs"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "comments"
      referencedColumns: ["id"]
    }
                  ]
                },"cost_categories": {
                  Row: {
                    "id": string,"name": string,"org_id": string,"sort": number
                  }
                  Insert: {
                    "id"?: string,"name": string,"org_id": string,"sort"?: number
                  }
                  Update: {
                    "id"?: string,"name"?: string,"org_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_categories_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"cost_codes": {
                  Row: {
                    "category_id": string,"code": string,"created_at": string,"description": string | null,"id": string,"internal_notes": string | null,"is_active": boolean,"is_labor": boolean,"org_id": string,"parent_id": string | null,"sort": number,"title": string,"updated_at": string
                  }
                  Insert: {
                    "category_id": string,"code": string,"created_at"?: string,"description"?: string | null,"id"?: string,"internal_notes"?: string | null,"is_active"?: boolean,"is_labor"?: boolean,"org_id": string,"parent_id"?: string | null,"sort"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category_id"?: string,"code"?: string,"created_at"?: string,"description"?: string | null,"id"?: string,"internal_notes"?: string | null,"is_active"?: boolean,"is_labor"?: boolean,"org_id"?: string,"parent_id"?: string | null,"sort"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_codes_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "cost_categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_codes_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_codes_parent_id_fkey"
      columns: ["parent_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"custom_field_defs": {
                  Row: {
                    "created_at": string,"data_type": Database["public"]['Enums']["field_type"],"id": string,"is_active": boolean,"is_filterable": boolean,"is_required": boolean,"key": string,"label": string,"module": string,"options": NonNullable<Json>,"org_id": string,"sort": number,"tooltip": string | null,"visible_to_clients": boolean,"visible_to_subs": boolean
                  }
                  Insert: {
                    "created_at"?: string,"data_type": Database["public"]['Enums']["field_type"],"id"?: string,"is_active"?: boolean,"is_filterable"?: boolean,"is_required"?: boolean,"key": string,"label": string,"module": string,"options"?: NonNullable<Json>,"org_id": string,"sort"?: number,"tooltip"?: string | null,"visible_to_clients"?: boolean,"visible_to_subs"?: boolean
                  }
                  Update: {
                    "created_at"?: string,"data_type"?: Database["public"]['Enums']["field_type"],"id"?: string,"is_active"?: boolean,"is_filterable"?: boolean,"is_required"?: boolean,"key"?: string,"label"?: string,"module"?: string,"options"?: NonNullable<Json>,"org_id"?: string,"sort"?: number,"tooltip"?: string | null,"visible_to_clients"?: boolean,"visible_to_subs"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "custom_field_defs_module_fkey"
      columns: ["module"]
isOneToOne: false
      referencedRelation: "app_modules"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "custom_field_defs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"daily_logs": {
                  Row: {
                    "author_type": string,"created_at": string,"created_by": string,"custom": NonNullable<Json>,"deleted_at": string | null,"id": string,"include_weather": boolean,"include_weather_notes": boolean,"job_id": string,"log_date": string,"notes": string,"org_id": string,"published_at": string | null,"share_clients": boolean,"share_internal": boolean,"share_subs": boolean,"status": Database["public"]['Enums']["log_status"],"tag_ids": (string)[],"title": string | null,"updated_at": string,"weather": Json | null,"weather_notes": string | null
                  }
                  Insert: {
                    "author_type"?: string,"created_at"?: string,"created_by"?: string,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"id"?: string,"include_weather"?: boolean,"include_weather_notes"?: boolean,"job_id": string,"log_date"?: string,"notes": string,"org_id": string,"published_at"?: string | null,"share_clients"?: boolean,"share_internal"?: boolean,"share_subs"?: boolean,"status"?: Database["public"]['Enums']["log_status"],"tag_ids"?: (string)[],"title"?: string | null,"updated_at"?: string,"weather"?: Json | null,"weather_notes"?: string | null
                  }
                  Update: {
                    "author_type"?: string,"created_at"?: string,"created_by"?: string,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"id"?: string,"include_weather"?: boolean,"include_weather_notes"?: boolean,"job_id"?: string,"log_date"?: string,"notes"?: string,"org_id"?: string,"published_at"?: string | null,"share_clients"?: boolean,"share_internal"?: boolean,"share_subs"?: boolean,"status"?: Database["public"]['Enums']["log_status"],"tag_ids"?: (string)[],"title"?: string | null,"updated_at"?: string,"weather"?: Json | null,"weather_notes"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "daily_logs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_logs_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "daily_logs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"invites": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"job_client_id": string | null,"kind": Database["public"]['Enums']["invite_kind"],"org_id": string,"role_id": string | null,"sub_org_id": string | null,"token": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"job_client_id"?: string | null,"kind": Database["public"]['Enums']["invite_kind"],"org_id": string,"role_id"?: string | null,"sub_org_id"?: string | null,"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"job_client_id"?: string | null,"kind"?: Database["public"]['Enums']["invite_kind"],"org_id"?: string,"role_id"?: string | null,"sub_org_id"?: string | null,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invites_job_client_id_fkey"
      columns: ["job_client_id"]
isOneToOne: false
      referencedRelation: "job_clients"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invites_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"job_client_permissions": {
                  Row: {
                    "job_id": string,"settings": NonNullable<Json>
                  }
                  Insert: {
                    "job_id": string,"settings": NonNullable<Json>
                  }
                  Update: {
                    "job_id"?: string,"settings"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_client_permissions_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_clients": {
                  Row: {
                    "created_at": string,"email": string | null,"first_name": string,"id": string,"invited_at": string | null,"is_primary": boolean,"job_id": string,"last_name": string,"phone": string | null,"user_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"email"?: string | null,"first_name"?: string,"id"?: string,"invited_at"?: string | null,"is_primary"?: boolean,"job_id": string,"last_name"?: string,"phone"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"email"?: string | null,"first_name"?: string,"id"?: string,"invited_at"?: string | null,"is_primary"?: boolean,"job_id"?: string,"last_name"?: string,"phone"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_clients_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_clients_profile_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"job_group_members": {
                  Row: {
                    "group_id": string,"job_id": string
                  }
                  Insert: {
                    "group_id": string,"job_id": string
                  }
                  Update: {
                    "group_id"?: string,"job_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_group_members_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "job_groups"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_group_members_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_groups": {
                  Row: {
                    "id": string,"name": string,"org_id": string
                  }
                  Insert: {
                    "id"?: string,"name": string,"org_id": string
                  }
                  Update: {
                    "id"?: string,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_groups_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"job_managers": {
                  Row: {
                    "job_id": string,"user_id": string
                  }
                  Insert: {
                    "job_id": string,"user_id": string
                  }
                  Update: {
                    "job_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_managers_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_managers_profile_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"job_members": {
                  Row: {
                    "added_at": string,"job_id": string,"user_id": string
                  }
                  Insert: {
                    "added_at"?: string,"job_id": string,"user_id": string
                  }
                  Update: {
                    "added_at"?: string,"job_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_members_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_members_profile_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"job_private": {
                  Row: {
                    "contract_price": number | null,"internal_notes": string | null,"job_id": string,"updated_at": string
                  }
                  Insert: {
                    "contract_price"?: number | null,"internal_notes"?: string | null,"job_id": string,"updated_at"?: string
                  }
                  Update: {
                    "contract_price"?: number | null,"internal_notes"?: string | null,"job_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_private_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"job_subs": {
                  Row: {
                    "added_at": string,"can_assign_rfis_to_subs": boolean,"can_share_with_client": boolean,"can_view_owner_info": boolean,"job_id": string,"see_all_schedule_items": boolean,"sub_org_id": string
                  }
                  Insert: {
                    "added_at"?: string,"can_assign_rfis_to_subs"?: boolean,"can_share_with_client"?: boolean,"can_view_owner_info"?: boolean,"job_id": string,"see_all_schedule_items"?: boolean,"sub_org_id": string
                  }
                  Update: {
                    "added_at"?: string,"can_assign_rfis_to_subs"?: boolean,"can_share_with_client"?: boolean,"can_view_owner_info"?: boolean,"job_id"?: string,"see_all_schedule_items"?: boolean,"sub_org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_subs_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_subs_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"jobs": {
                  Row: {
                    "actual_end": string | null,"actual_start": string | null,"city": string | null,"color": string,"contract_type": Database["public"]['Enums']["contract_type"],"created_at": string,"created_by": string | null,"custom": NonNullable<Json>,"deleted_at": string | null,"id": string,"job_type": string | null,"lat": number | null,"lng": number | null,"lot_info": string | null,"org_id": string,"permit_number": string | null,"postal_code": string | null,"prefix": string | null,"projected_end": string | null,"projected_start": string | null,"province": string | null,"square_feet": number | null,"status": Database["public"]['Enums']["job_status"],"street": string | null,"sub_notes": string | null,"title": string,"updated_at": string,"work_days": (number)[]
                  }
                  Insert: {
                    "actual_end"?: string | null,"actual_start"?: string | null,"city"?: string | null,"color"?: string,"contract_type"?: Database["public"]['Enums']["contract_type"],"created_at"?: string,"created_by"?: string | null,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"id"?: string,"job_type"?: string | null,"lat"?: number | null,"lng"?: number | null,"lot_info"?: string | null,"org_id": string,"permit_number"?: string | null,"postal_code"?: string | null,"prefix"?: string | null,"projected_end"?: string | null,"projected_start"?: string | null,"province"?: string | null,"square_feet"?: number | null,"status"?: Database["public"]['Enums']["job_status"],"street"?: string | null,"sub_notes"?: string | null,"title": string,"updated_at"?: string,"work_days"?: (number)[]
                  }
                  Update: {
                    "actual_end"?: string | null,"actual_start"?: string | null,"city"?: string | null,"color"?: string,"contract_type"?: Database["public"]['Enums']["contract_type"],"created_at"?: string,"created_by"?: string | null,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"id"?: string,"job_type"?: string | null,"lat"?: number | null,"lng"?: number | null,"lot_info"?: string | null,"org_id"?: string,"permit_number"?: string | null,"postal_code"?: string | null,"prefix"?: string | null,"projected_end"?: string | null,"projected_start"?: string | null,"province"?: string | null,"square_feet"?: number | null,"status"?: Database["public"]['Enums']["job_status"],"street"?: string | null,"sub_notes"?: string | null,"title"?: string,"updated_at"?: string,"work_days"?: (number)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "jobs_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_deliveries": {
                  Row: {
                    "attempts": number,"channel": Database["public"]['Enums']["delivery_channel"],"created_at": string,"id": string,"last_error": string | null,"notification_id": string,"sent_at": string | null,"status": Database["public"]['Enums']["delivery_status"]
                  }
                  Insert: {
                    "attempts"?: number,"channel": Database["public"]['Enums']["delivery_channel"],"created_at"?: string,"id"?: string,"last_error"?: string | null,"notification_id": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"]
                  }
                  Update: {
                    "attempts"?: number,"channel"?: Database["public"]['Enums']["delivery_channel"],"created_at"?: string,"id"?: string,"last_error"?: string | null,"notification_id"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["delivery_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_deliveries_notification_id_fkey"
      columns: ["notification_id"]
isOneToOne: false
      referencedRelation: "notifications"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_prefs": {
                  Row: {
                    "email": boolean,"push": boolean,"text": boolean,"type": string,"user_id": string
                  }
                  Insert: {
                    "email": boolean,"push": boolean,"text": boolean,"type": string,"user_id": string
                  }
                  Update: {
                    "email"?: boolean,"push"?: boolean,"text"?: boolean,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_prefs_type_fkey"
      columns: ["type"]
isOneToOne: false
      referencedRelation: "app_notification_types"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "notification_prefs_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "actor_id": string | null,"body": string | null,"created_at": string,"id": string,"job_id": string | null,"link": string | null,"org_id": string | null,"read_at": string | null,"title": string,"type": string,"user_id": string
                  }
                  Insert: {
                    "actor_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"job_id"?: string | null,"link"?: string | null,"org_id"?: string | null,"read_at"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "actor_id"?: string | null,"body"?: string | null,"created_at"?: string,"id"?: string,"job_id"?: string | null,"link"?: string | null,"org_id"?: string | null,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_type_fkey"
      columns: ["type"]
isOneToOne: false
      referencedRelation: "app_notification_types"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"org_members": {
                  Row: {
                    "all_jobs": boolean,"billable_rate": number | null,"is_admin": boolean,"joined_at": string,"labor_cost_rate": number | null,"org_id": string,"role_id": string | null,"status": Database["public"]['Enums']["member_status"],"title": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "all_jobs"?: boolean,"billable_rate"?: number | null,"is_admin"?: boolean,"joined_at"?: string,"labor_cost_rate"?: number | null,"org_id": string,"role_id"?: string | null,"status"?: Database["public"]['Enums']["member_status"],"title"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "all_jobs"?: boolean,"billable_rate"?: number | null,"is_admin"?: boolean,"joined_at"?: string,"labor_cost_rate"?: number | null,"org_id"?: string,"role_id"?: string | null,"status"?: Database["public"]['Enums']["member_status"],"title"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "org_members_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_profile_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "org_members_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "city": string | null,"country": string,"created_at": string,"created_by": string | null,"email": string | null,"id": string,"kind": Database["public"]['Enums']["org_kind"],"legal_name": string | null,"logo_url": string | null,"name": string,"phone": string | null,"postal_code": string | null,"province": string | null,"street": string | null,"timezone": string,"updated_at": string,"website": string | null
                  }
                  Insert: {
                    "city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["org_kind"],"legal_name"?: string | null,"logo_url"?: string | null,"name": string,"phone"?: string | null,"postal_code"?: string | null,"province"?: string | null,"street"?: string | null,"timezone"?: string,"updated_at"?: string,"website"?: string | null
                  }
                  Update: {
                    "city"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"email"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["org_kind"],"legal_name"?: string | null,"logo_url"?: string | null,"name"?: string,"phone"?: string | null,"postal_code"?: string | null,"province"?: string | null,"street"?: string | null,"timezone"?: string,"updated_at"?: string,"website"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"first_name": string,"id": string,"last_name": string,"phone": string | null,"updated_at": string
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"first_name"?: string,"id": string,"last_name"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"related_items": {
                  Row: {
                    "created_at": string,"created_by": string,"from_id": string,"from_type": string,"id": string,"job_id": string,"org_id": string,"to_id": string,"to_type": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"from_id": string,"from_type": string,"id"?: string,"job_id": string,"org_id": string,"to_id": string,"to_type": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"from_id"?: string,"from_type"?: string,"id"?: string,"job_id"?: string,"org_id"?: string,"to_id"?: string,"to_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "related_items_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "related_items_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "related_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"rfi_responses": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"id": string,"rfi_id": string
                  }
                  Insert: {
                    "author_id"?: string,"body": string,"created_at"?: string,"id"?: string,"rfi_id": string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"rfi_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfi_responses_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfi_responses_rfi_id_fkey"
      columns: ["rfi_id"]
isOneToOne: false
      referencedRelation: "rfis"
      referencedColumns: ["id"]
    }
                  ]
                },"rfis": {
                  Row: {
                    "assignee_sub_org_id": string | null,"assignee_user_id": string | null,"author_sub_org_id": string | null,"author_type": string,"completed_at": string | null,"created_at": string,"created_by": string,"deleted_at": string | null,"due_date": string,"id": string,"job_id": string,"number": number,"org_id": string,"question": string,"sent_at": string | null,"status": Database["public"]['Enums']["rfi_status"],"title": string,"updated_at": string
                  }
                  Insert: {
                    "assignee_sub_org_id"?: string | null,"assignee_user_id"?: string | null,"author_sub_org_id"?: string | null,"author_type"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_date": string,"id"?: string,"job_id": string,"number"?: number,"org_id": string,"question": string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["rfi_status"],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "assignee_sub_org_id"?: string | null,"assignee_user_id"?: string | null,"author_sub_org_id"?: string | null,"author_type"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_date"?: string,"id"?: string,"job_id"?: string,"number"?: number,"org_id"?: string,"question"?: string,"sent_at"?: string | null,"status"?: Database["public"]['Enums']["rfi_status"],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "rfis_assignee_sub_org_id_fkey"
      columns: ["assignee_sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfis_assignee_user_id_fkey"
      columns: ["assignee_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfis_author_sub_org_id_fkey"
      columns: ["author_sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfis_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfis_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "rfis_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"role_actions": {
                  Row: {
                    "action": string,"role_id": string
                  }
                  Insert: {
                    "action": string,"role_id": string
                  }
                  Update: {
                    "action"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_actions_action_fkey"
      columns: ["action"]
isOneToOne: false
      referencedRelation: "app_actions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_actions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "can_add": boolean,"can_delete": boolean,"can_edit": boolean,"can_view": boolean,"module": string,"role_id": string,"scope": Database["public"]['Enums']["perm_scope"],"see_cost": boolean,"see_price": boolean
                  }
                  Insert: {
                    "can_add"?: boolean,"can_delete"?: boolean,"can_edit"?: boolean,"can_view"?: boolean,"module": string,"role_id": string,"scope"?: Database["public"]['Enums']["perm_scope"],"see_cost"?: boolean,"see_price"?: boolean
                  }
                  Update: {
                    "can_add"?: boolean,"can_delete"?: boolean,"can_edit"?: boolean,"can_view"?: boolean,"module"?: string,"role_id"?: string,"scope"?: Database["public"]['Enums']["perm_scope"],"see_cost"?: boolean,"see_price"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_module_fkey"
      columns: ["module"]
isOneToOne: false
      referencedRelation: "app_modules"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "all_jobs_default": boolean,"allowed_job_statuses": (Database["public"]['Enums']["job_status"])[],"created_at": string,"description": string,"id": string,"is_builtin": boolean,"is_template": boolean,"name": string,"org_id": string | null,"sort": number,"template_key": string | null,"updated_at": string
                  }
                  Insert: {
                    "all_jobs_default"?: boolean,"allowed_job_statuses"?: (Database["public"]['Enums']["job_status"])[],"created_at"?: string,"description"?: string,"id"?: string,"is_builtin"?: boolean,"is_template"?: boolean,"name": string,"org_id"?: string | null,"sort"?: number,"template_key"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "all_jobs_default"?: boolean,"allowed_job_statuses"?: (Database["public"]['Enums']["job_status"])[],"created_at"?: string,"description"?: string,"id"?: string,"is_builtin"?: boolean,"is_template"?: boolean,"name"?: string,"org_id"?: string | null,"sort"?: number,"template_key"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"saved_views": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"id": string,"is_default": boolean,"is_shared": boolean,"module": string,"name": string,"org_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_default"?: boolean,"is_shared"?: boolean,"module": string,"name": string,"org_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"id"?: string,"is_default"?: boolean,"is_shared"?: boolean,"module"?: string,"name"?: string,"org_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_views_module_fkey"
      columns: ["module"]
isOneToOne: false
      referencedRelation: "app_modules"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "saved_views_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_views_profile_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tags": {
                  Row: {
                    "color": string | null,"id": string,"module": string,"name": string,"org_id": string
                  }
                  Insert: {
                    "color"?: string | null,"id"?: string,"module": string,"name": string,"org_id": string
                  }
                  Update: {
                    "color"?: string | null,"id"?: string,"module"?: string,"name"?: string,"org_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tags_module_fkey"
      columns: ["module"]
isOneToOne: false
      referencedRelation: "app_modules"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "tags_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"todo_assignees": {
                  Row: {
                    "id": string,"sub_org_id": string | null,"todo_id": string,"user_id": string | null
                  }
                  Insert: {
                    "id"?: string,"sub_org_id"?: string | null,"todo_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "id"?: string,"sub_org_id"?: string | null,"todo_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "todo_assignees_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "todo_assignees_todo_id_fkey"
      columns: ["todo_id"]
isOneToOne: false
      referencedRelation: "todos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "todo_assignees_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"todo_checklist": {
                  Row: {
                    "body": string,"done_at": string | null,"done_by": string | null,"id": string,"sort": number,"todo_id": string
                  }
                  Insert: {
                    "body": string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"sort"?: number,"todo_id": string
                  }
                  Update: {
                    "body"?: string,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"sort"?: number,"todo_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "todo_checklist_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "todo_checklist_todo_id_fkey"
      columns: ["todo_id"]
isOneToOne: false
      referencedRelation: "todos"
      referencedColumns: ["id"]
    }
                  ]
                },"todo_watchers": {
                  Row: {
                    "todo_id": string,"user_id": string
                  }
                  Insert: {
                    "todo_id": string,"user_id": string
                  }
                  Update: {
                    "todo_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "todo_watchers_todo_id_fkey"
      columns: ["todo_id"]
isOneToOne: false
      referencedRelation: "todos"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "todo_watchers_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"todos": {
                  Row: {
                    "completed_at": string | null,"completed_by": string | null,"created_at": string,"created_by": string,"deleted_at": string | null,"due_at": string | null,"has_due_time": boolean,"id": string,"job_id": string,"notes": string | null,"org_id": string,"priority": Database["public"]['Enums']["todo_priority"],"reminder_minutes": number | null,"tag_ids": (string)[],"title": string,"updated_at": string
                  }
                  Insert: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_at"?: string | null,"has_due_time"?: boolean,"id"?: string,"job_id": string,"notes"?: string | null,"org_id": string,"priority"?: Database["public"]['Enums']["todo_priority"],"reminder_minutes"?: number | null,"tag_ids"?: (string)[],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"completed_by"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_at"?: string | null,"has_due_time"?: boolean,"id"?: string,"job_id"?: string,"notes"?: string | null,"org_id"?: string,"priority"?: Database["public"]['Enums']["todo_priority"],"reminder_minutes"?: number | null,"tag_ids"?: (string)[],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "todos_completed_by_fkey"
      columns: ["completed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "todos_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "todos_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "todos_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"user_job_selection": {
                  Row: {
                    "all_jobs": boolean,"job_ids": (string)[],"org_id": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "all_jobs"?: boolean,"job_ids"?: (string)[],"org_id": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "all_jobs"?: boolean,"job_ids"?: (string)[],"org_id"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_job_selection_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"user_state": {
                  Row: {
                    "active_org_id": string | null,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "active_org_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "active_org_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_state_active_org_id_fkey"
      columns: ["active_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invite":
{ Args: { "p_token": string }; Returns: string
                           },
"add_comment":
{ Args: { "p_body": string,"p_job": string,"p_parent"?: string,"p_record_id": string,"p_record_type": string,"p_visible_to_clients"?: boolean,"p_visible_to_subs"?: boolean }; Returns: string
                           },
"add_sub_vendor":
{ Args: { "p_builder": string,"p_company_name": string,"p_contact_first"?: string,"p_contact_last"?: string,"p_email": string,"p_phone"?: string,"p_trade"?: string }; Returns: string
                           },
"clone_role":
{ Args: { "p_name": string,"p_role": string }; Returns: string
                           },
"create_builder_org":
{ Args: { "p_name": string,"p_province"?: string }; Returns: string
                           },
"create_sub_org":
{ Args: { "p_name": string }; Returns: string
                           },
"invite_internal_user":
{ Args: { "p_email": string,"p_org": string,"p_role": string }; Returns: string
                           },
"invite_job_client":
{ Args: { "p_job_client": string }; Returns: string
                           },
"invite_preview":
{ Args: { "p_token": string }; Returns: {
              "accepted": boolean,"email": string,"expired": boolean,"kind": Database["public"]['Enums']["invite_kind"],"org_name": string
            }[]
                           },
"mark_notifications_read":
{ Args: { "p_ids"?: (string)[] }; Returns: undefined
                           },
"my_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"my_permissions":
{ Args: { "p_org": string }; Returns: Json
                           },
"set_active_org":
{ Args: { "p_org": string }; Returns: undefined
                           },
"set_checklist_item":
{ Args: { "p_done": boolean,"p_item": string }; Returns: undefined
                           },
"set_job_selection":
{ Args: { "p_all": boolean,"p_job_ids": (string)[],"p_org": string }; Returns: undefined
                           },
"set_rfi_status":
{ Args: { "p_action": string,"p_rfi": string }; Returns: undefined
                           },
"set_todo_complete":
{ Args: { "p_done": boolean,"p_todo": string }; Returns: undefined
                           },
"update_my_sub_profile":
{ Args: { "p_link": string,"p_profile": Json }; Returns: undefined
                           }
          }
          Enums: {
            "contract_type": "fixed_price"|"open_book","cost_type": "labor"|"material"|"equipment"|"subcontractor"|"other"|"none","delivery_channel": "email"|"text"|"push","delivery_status": "queued"|"sent"|"failed"|"skipped","field_type": "text"|"long_text"|"number"|"currency"|"date"|"boolean"|"single_select"|"multi_select"|"file"|"hyperlink","invite_kind": "internal"|"sub"|"client","job_status": "presale"|"open"|"warranty"|"closed","link_status": "active"|"inactive","log_status": "draft"|"published","member_status": "active"|"inactive"|"archived","org_kind": "builder"|"sub","perm_scope": "all"|"assigned"|"own","rfi_status": "not_sent"|"sent"|"completed"|"reopened","todo_priority": "low"|"medium"|"high"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "contract_type": ["fixed_price", "open_book"],"cost_type": ["labor", "material", "equipment", "subcontractor", "other", "none"],"delivery_channel": ["email", "text", "push"],"delivery_status": ["queued", "sent", "failed", "skipped"],"field_type": ["text", "long_text", "number", "currency", "date", "boolean", "single_select", "multi_select", "file", "hyperlink"],"invite_kind": ["internal", "sub", "client"],"job_status": ["presale", "open", "warranty", "closed"],"link_status": ["active", "inactive"],"log_status": ["draft", "published"],"member_status": ["active", "inactive", "archived"],"org_kind": ["builder", "sub"],"perm_scope": ["all", "assigned", "own"],"rfi_status": ["not_sent", "sent", "completed", "reopened"],"todo_priority": ["low", "medium", "high"]
          }
        }
} as const

