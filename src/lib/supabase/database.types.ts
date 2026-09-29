
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
                },"bid_package_items": {
                  Row: {
                    "cost_code_id": string | null,"cost_type": Database["public"]['Enums']["cost_type"],"description": string | null,"id": string,"package_id": string,"quantity": number,"sort": number,"title": string,"unit": string
                  }
                  Insert: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"description"?: string | null,"id"?: string,"package_id": string,"quantity"?: number,"sort"?: number,"title": string,"unit"?: string
                  }
                  Update: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"description"?: string | null,"id"?: string,"package_id"?: string,"quantity"?: number,"sort"?: number,"title"?: string,"unit"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bid_package_items_cost_code_id_fkey"
      columns: ["cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bid_package_items_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "bid_packages"
      referencedColumns: ["id"]
    }
                  ]
                },"bid_packages": {
                  Row: {
                    "created_at": string,"created_by": string,"deleted_at": string | null,"due_at": string | null,"id": string,"job_id": string,"number": number,"org_id": string,"released_at": string | null,"scope": string | null,"status": Database["public"]['Enums']["bid_package_status"],"title": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_at"?: string | null,"id"?: string,"job_id": string,"number": number,"org_id": string,"released_at"?: string | null,"scope"?: string | null,"status"?: Database["public"]['Enums']["bid_package_status"],"title": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_at"?: string | null,"id"?: string,"job_id"?: string,"number"?: number,"org_id"?: string,"released_at"?: string | null,"scope"?: string | null,"status"?: Database["public"]['Enums']["bid_package_status"],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bid_packages_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bid_packages_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bid_packages_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"bid_request_prices": {
                  Row: {
                    "item_id": string,"notes": string | null,"request_id": string,"unit_cost": number
                  }
                  Insert: {
                    "item_id": string,"notes"?: string | null,"request_id": string,"unit_cost": number
                  }
                  Update: {
                    "item_id"?: string,"notes"?: string | null,"request_id"?: string,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bid_request_prices_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "bid_package_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bid_request_prices_request_id_fkey"
      columns: ["request_id"]
isOneToOne: false
      referencedRelation: "bid_requests"
      referencedColumns: ["id"]
    }
                  ]
                },"bid_requests": {
                  Row: {
                    "created_at": string,"decline_reason": string | null,"id": string,"notes": string | null,"package_id": string,"status": Database["public"]['Enums']["bid_request_status"],"sub_org_id": string,"submitted_at": string | null,"submitted_by": string | null,"total": number | null
                  }
                  Insert: {
                    "created_at"?: string,"decline_reason"?: string | null,"id"?: string,"notes"?: string | null,"package_id": string,"status"?: Database["public"]['Enums']["bid_request_status"],"sub_org_id": string,"submitted_at"?: string | null,"submitted_by"?: string | null,"total"?: number | null
                  }
                  Update: {
                    "created_at"?: string,"decline_reason"?: string | null,"id"?: string,"notes"?: string | null,"package_id"?: string,"status"?: Database["public"]['Enums']["bid_request_status"],"sub_org_id"?: string,"submitted_at"?: string | null,"submitted_by"?: string | null,"total"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bid_requests_package_id_fkey"
      columns: ["package_id"]
isOneToOne: false
      referencedRelation: "bid_packages"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bid_requests_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bid_requests_submitted_by_fkey"
      columns: ["submitted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"bill_items": {
                  Row: {
                    "amount": number,"bill_id": string,"cost_code_id": string | null,"cost_type": Database["public"]['Enums']["cost_type"],"id": string,"po_item_id": string | null,"sort": number,"title": string
                  }
                  Insert: {
                    "amount": number,"bill_id": string,"cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"id"?: string,"po_item_id"?: string | null,"sort"?: number,"title": string
                  }
                  Update: {
                    "amount"?: number,"bill_id"?: string,"cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"id"?: string,"po_item_id"?: string | null,"sort"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bill_items_bill_id_fkey"
      columns: ["bill_id"]
isOneToOne: false
      referencedRelation: "bills"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_items_cost_code_id_fkey"
      columns: ["cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bill_items_po_item_id_fkey"
      columns: ["po_item_id"]
isOneToOne: false
      referencedRelation: "po_items"
      referencedColumns: ["id"]
    }
                  ]
                },"bills": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"created_by": string,"deleted_at": string | null,"due_date": string | null,"holdback_pct": number,"id": string,"invoice_date": string,"invoice_ref": string | null,"is_holdback_release": boolean,"job_id": string,"lien_waiver_file_id": string | null,"lien_waiver_received_at": string | null,"lien_waiver_required": boolean,"number": number,"org_id": string,"paid_amount": number | null,"paid_at": string | null,"payment_method": string | null,"payment_ref": string | null,"po_id": string | null,"rejected_reason": string | null,"status": Database["public"]['Enums']["bill_status"],"sub_org_id": string | null,"submitted_by_sub": boolean,"tax_amount": number,"title": string,"vendor_name": string | null
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_date"?: string | null,"holdback_pct"?: number,"id"?: string,"invoice_date"?: string,"invoice_ref"?: string | null,"is_holdback_release"?: boolean,"job_id": string,"lien_waiver_file_id"?: string | null,"lien_waiver_received_at"?: string | null,"lien_waiver_required"?: boolean,"number": number,"org_id": string,"paid_amount"?: number | null,"paid_at"?: string | null,"payment_method"?: string | null,"payment_ref"?: string | null,"po_id"?: string | null,"rejected_reason"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"sub_org_id"?: string | null,"submitted_by_sub"?: boolean,"tax_amount"?: number,"title": string,"vendor_name"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"due_date"?: string | null,"holdback_pct"?: number,"id"?: string,"invoice_date"?: string,"invoice_ref"?: string | null,"is_holdback_release"?: boolean,"job_id"?: string,"lien_waiver_file_id"?: string | null,"lien_waiver_received_at"?: string | null,"lien_waiver_required"?: boolean,"number"?: number,"org_id"?: string,"paid_amount"?: number | null,"paid_at"?: string | null,"payment_method"?: string | null,"payment_ref"?: string | null,"po_id"?: string | null,"rejected_reason"?: string | null,"status"?: Database["public"]['Enums']["bill_status"],"sub_org_id"?: string | null,"submitted_by_sub"?: boolean,"tax_amount"?: number,"title"?: string,"vendor_name"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "bills_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_lien_waiver_file_id_fkey"
      columns: ["lien_waiver_file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_po_id_fkey"
      columns: ["po_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bills_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"budget_lines": {
                  Row: {
                    "change_order_id": string | null,"cost_code_id": string | null,"cost_type": Database["public"]['Enums']["cost_type"],"created_at": string,"id": string,"job_id": string,"org_id": string,"original_cost": number,"original_price": number,"source": string
                  }
                  Insert: {
                    "change_order_id"?: string | null,"cost_code_id"?: string | null,"cost_type": Database["public"]['Enums']["cost_type"],"created_at"?: string,"id"?: string,"job_id": string,"org_id": string,"original_cost"?: number,"original_price"?: number,"source"?: string
                  }
                  Update: {
                    "change_order_id"?: string | null,"cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"created_at"?: string,"id"?: string,"job_id"?: string,"org_id"?: string,"original_cost"?: number,"original_price"?: number,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_lines_change_order_id_fkey"
      columns: ["change_order_id"]
isOneToOne: false
      referencedRelation: "change_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_lines_cost_code_id_fkey"
      columns: ["cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_lines_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_lines_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
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
                },"change_order_items": {
                  Row: {
                    "change_order_id": string,"cost_code_id": string | null,"cost_type": Database["public"]['Enums']["cost_type"],"description": string | null,"id": string,"internal_notes": string | null,"markup_type": Database["public"]['Enums']["markup_type"],"markup_value": number,"quantity": number,"sort": number,"taxable": boolean,"title": string,"unit": string,"unit_cost": number,"co_item_price": number | null
                  }
                  Insert: {
                    "change_order_id": string,"cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"description"?: string | null,"id"?: string,"internal_notes"?: string | null,"markup_type"?: Database["public"]['Enums']["markup_type"],"markup_value"?: number,"quantity"?: number,"sort"?: number,"taxable"?: boolean,"title": string,"unit"?: string,"unit_cost"?: number
                  }
                  Update: {
                    "change_order_id"?: string,"cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"description"?: string | null,"id"?: string,"internal_notes"?: string | null,"markup_type"?: Database["public"]['Enums']["markup_type"],"markup_value"?: number,"quantity"?: number,"sort"?: number,"taxable"?: boolean,"title"?: string,"unit"?: string,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "change_order_items_change_order_id_fkey"
      columns: ["change_order_id"]
isOneToOne: false
      referencedRelation: "change_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_order_items_cost_code_id_fkey"
      columns: ["cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    }
                  ]
                },"change_order_signatures": {
                  Row: {
                    "change_order_id": string,"comment": string | null,"decision": string,"id": string,"ip": string | null,"on_behalf": boolean,"signature": string | null,"signed_at": string,"signer_name": string,"signer_user_id": string | null,"user_agent": string | null
                  }
                  Insert: {
                    "change_order_id": string,"comment"?: string | null,"decision": string,"id"?: string,"ip"?: string | null,"on_behalf"?: boolean,"signature"?: string | null,"signed_at"?: string,"signer_name": string,"signer_user_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "change_order_id"?: string,"comment"?: string | null,"decision"?: string,"id"?: string,"ip"?: string | null,"on_behalf"?: boolean,"signature"?: string | null,"signed_at"?: string,"signer_name"?: string,"signer_user_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "change_order_signatures_change_order_id_fkey"
      columns: ["change_order_id"]
isOneToOne: false
      referencedRelation: "change_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_order_signatures_signer_user_id_fkey"
      columns: ["signer_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"change_orders": {
                  Row: {
                    "approval_deadline": string | null,"collect_signature": boolean,"created_at": string,"created_by": string,"decided_at": string | null,"default_markup_pct": number,"description": string | null,"id": string,"internal_notes": string | null,"job_id": string,"number": number,"org_id": string,"released_at": string | null,"requested_by_client": boolean,"snapshot": Json | null,"status": Database["public"]['Enums']["co_status"],"subtotal": number | null,"tax": number | null,"tax_label": string,"tax_rate": number,"title": string,"total": number | null
                  }
                  Insert: {
                    "approval_deadline"?: string | null,"collect_signature"?: boolean,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"default_markup_pct"?: number,"description"?: string | null,"id"?: string,"internal_notes"?: string | null,"job_id": string,"number": number,"org_id": string,"released_at"?: string | null,"requested_by_client"?: boolean,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["co_status"],"subtotal"?: number | null,"tax"?: number | null,"tax_label"?: string,"tax_rate"?: number,"title": string,"total"?: number | null
                  }
                  Update: {
                    "approval_deadline"?: string | null,"collect_signature"?: boolean,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"default_markup_pct"?: number,"description"?: string | null,"id"?: string,"internal_notes"?: string | null,"job_id"?: string,"number"?: number,"org_id"?: string,"released_at"?: string | null,"requested_by_client"?: boolean,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["co_status"],"subtotal"?: number | null,"tax"?: number | null,"tax_label"?: string,"tax_rate"?: number,"title"?: string,"total"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "change_orders_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_orders_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "change_orders_org_id_fkey"
      columns: ["org_id"]
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
                },"cost_items": {
                  Row: {
                    "cost_code_id": string | null,"cost_type": Database["public"]['Enums']["cost_type"],"created_at": string,"description": string | null,"id": string,"is_active": boolean,"markup_type": Database["public"]['Enums']["markup_type"],"markup_value": number,"org_id": string,"taxable": boolean,"title": string,"unit": string,"unit_cost": number
                  }
                  Insert: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"markup_type"?: Database["public"]['Enums']["markup_type"],"markup_value"?: number,"org_id": string,"taxable"?: boolean,"title": string,"unit"?: string,"unit_cost"?: number
                  }
                  Update: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"created_at"?: string,"description"?: string | null,"id"?: string,"is_active"?: boolean,"markup_type"?: Database["public"]['Enums']["markup_type"],"markup_value"?: number,"org_id"?: string,"taxable"?: boolean,"title"?: string,"unit"?: string,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cost_items_cost_code_id_fkey"
      columns: ["cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cost_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
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
                },"estimate_groups": {
                  Row: {
                    "estimate_id": string,"id": string,"is_optional": boolean,"name": string,"option_status": Database["public"]['Enums']["option_status"],"sort": number
                  }
                  Insert: {
                    "estimate_id": string,"id"?: string,"is_optional"?: boolean,"name": string,"option_status"?: Database["public"]['Enums']["option_status"],"sort"?: number
                  }
                  Update: {
                    "estimate_id"?: string,"id"?: string,"is_optional"?: boolean,"name"?: string,"option_status"?: Database["public"]['Enums']["option_status"],"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "estimate_groups_estimate_id_fkey"
      columns: ["estimate_id"]
isOneToOne: false
      referencedRelation: "estimates"
      referencedColumns: ["id"]
    }
                  ]
                },"estimate_items": {
                  Row: {
                    "cost_code_id": string | null,"cost_type": Database["public"]['Enums']["cost_type"],"created_at": string,"description": string | null,"estimate_id": string,"group_id": string | null,"id": string,"internal_notes": string | null,"marked_as": Database["public"]['Enums']["marked_as"],"markup_type": Database["public"]['Enums']["markup_type"],"markup_value": number,"quantity": number,"sort": number,"taxable": boolean,"title": string,"unit": string,"unit_cost": number,"item_cost": number | null,"item_price": number | null
                  }
                  Insert: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"created_at"?: string,"description"?: string | null,"estimate_id": string,"group_id"?: string | null,"id"?: string,"internal_notes"?: string | null,"marked_as"?: Database["public"]['Enums']["marked_as"],"markup_type"?: Database["public"]['Enums']["markup_type"],"markup_value"?: number,"quantity"?: number,"sort"?: number,"taxable"?: boolean,"title": string,"unit"?: string,"unit_cost"?: number
                  }
                  Update: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"created_at"?: string,"description"?: string | null,"estimate_id"?: string,"group_id"?: string | null,"id"?: string,"internal_notes"?: string | null,"marked_as"?: Database["public"]['Enums']["marked_as"],"markup_type"?: Database["public"]['Enums']["markup_type"],"markup_value"?: number,"quantity"?: number,"sort"?: number,"taxable"?: boolean,"title"?: string,"unit"?: string,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "estimate_items_cost_code_id_fkey"
      columns: ["cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estimate_items_estimate_id_fkey"
      columns: ["estimate_id"]
isOneToOne: false
      referencedRelation: "estimates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estimate_items_group_id_fkey"
      columns: ["group_id"]
isOneToOne: false
      referencedRelation: "estimate_groups"
      referencedColumns: ["id"]
    }
                  ]
                },"estimates": {
                  Row: {
                    "created_at": string,"default_markup_pct": number,"id": string,"job_id": string,"locked_at": string | null,"org_id": string,"sent_to_budget_at": string | null,"tax_label": string,"tax_rate": number,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"default_markup_pct"?: number,"id"?: string,"job_id": string,"locked_at"?: string | null,"org_id": string,"sent_to_budget_at"?: string | null,"tax_label"?: string,"tax_rate"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_markup_pct"?: number,"id"?: string,"job_id"?: string,"locked_at"?: string | null,"org_id"?: string,"sent_to_budget_at"?: string | null,"tax_label"?: string,"tax_rate"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "estimates_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "estimates_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"file_folders": {
                  Row: {
                    "created_at": string,"created_by": string | null,"deleted_at": string | null,"id": string,"job_id": string | null,"kind": Database["public"]['Enums']["file_kind"],"name": string,"org_id": string,"share_clients": boolean,"share_subs": boolean,"system_key": string | null,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"job_id"?: string | null,"kind": Database["public"]['Enums']["file_kind"],"name": string,"org_id": string,"share_clients"?: boolean,"share_subs"?: boolean,"system_key"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"id"?: string,"job_id"?: string | null,"kind"?: Database["public"]['Enums']["file_kind"],"name"?: string,"org_id"?: string,"share_clients"?: boolean,"share_subs"?: boolean,"system_key"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_folders_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_folders_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_folders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"file_share_links": {
                  Row: {
                    "created_at": string,"created_by": string,"expires_at": string | null,"file_id": string,"id": string,"revoked_at": string | null,"token": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"file_id": string,"id"?: string,"revoked_at"?: string | null,"token"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"expires_at"?: string | null,"file_id"?: string,"id"?: string,"revoked_at"?: string | null,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_share_links_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_share_links_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
                  ]
                },"file_versions": {
                  Row: {
                    "created_at": string,"file_id": string,"id": string,"mime": string,"size_bytes": number,"storage_key": string,"uploaded_by": string | null,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"file_id": string,"id"?: string,"mime": string,"size_bytes": number,"storage_key": string,"uploaded_by"?: string | null,"version": number
                  }
                  Update: {
                    "created_at"?: string,"file_id"?: string,"id"?: string,"mime"?: string,"size_bytes"?: number,"storage_key"?: string,"uploaded_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "file_versions_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "file_versions_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"files": {
                  Row: {
                    "created_at": string,"deleted_at": string | null,"folder_id": string,"id": string,"job_id": string | null,"kind": Database["public"]['Enums']["file_kind"],"mime": string,"name": string,"org_id": string,"share_clients": boolean,"share_subs": boolean,"size_bytes": number,"status": Database["public"]['Enums']["file_status"],"storage_key": string,"updated_at": string,"uploaded_by": string,"uploader_org": string | null,"uploader_type": string,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"deleted_at"?: string | null,"folder_id": string,"id"?: string,"job_id"?: string | null,"kind": Database["public"]['Enums']["file_kind"],"mime"?: string,"name": string,"org_id": string,"share_clients"?: boolean,"share_subs"?: boolean,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"storage_key": string,"updated_at"?: string,"uploaded_by"?: string,"uploader_org"?: string | null,"uploader_type"?: string,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"deleted_at"?: string | null,"folder_id"?: string,"id"?: string,"job_id"?: string | null,"kind"?: Database["public"]['Enums']["file_kind"],"mime"?: string,"name"?: string,"org_id"?: string,"share_clients"?: boolean,"share_subs"?: boolean,"size_bytes"?: number,"status"?: Database["public"]['Enums']["file_status"],"storage_key"?: string,"updated_at"?: string,"uploaded_by"?: string,"uploader_org"?: string | null,"uploader_type"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "files_folder_id_fkey"
      columns: ["folder_id"]
isOneToOne: false
      referencedRelation: "file_folders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "files_uploader_org_fkey"
      columns: ["uploader_org"]
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
                },"job_schedule_settings": {
                  Row: {
                    "is_online": boolean,"job_id": string,"online_at": string | null,"org_id": string,"updated_at": string
                  }
                  Insert: {
                    "is_online"?: boolean,"job_id": string,"online_at"?: string | null,"org_id": string,"updated_at"?: string
                  }
                  Update: {
                    "is_online"?: boolean,"job_id"?: string,"online_at"?: string | null,"org_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_schedule_settings_job_id_fkey"
      columns: ["job_id"]
isOneToOne: true
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_schedule_settings_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
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
                },"lead_activities": {
                  Row: {
                    "activity_date": string,"assigned_to": string | null,"attendees": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"description": string | null,"end_time": string | null,"id": string,"initiated_by": string,"lead_id": string,"location": string | null,"org_id": string,"reminder_minutes": number | null,"start_time": string | null,"title": string | null,"type": Database["public"]['Enums']["activity_type"]
                  }
                  Insert: {
                    "activity_date"?: string,"assigned_to"?: string | null,"attendees"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_time"?: string | null,"id"?: string,"initiated_by"?: string,"lead_id": string,"location"?: string | null,"org_id": string,"reminder_minutes"?: number | null,"start_time"?: string | null,"title"?: string | null,"type": Database["public"]['Enums']["activity_type"]
                  }
                  Update: {
                    "activity_date"?: string,"assigned_to"?: string | null,"attendees"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_time"?: string | null,"id"?: string,"initiated_by"?: string,"lead_id"?: string,"location"?: string | null,"org_id"?: string,"reminder_minutes"?: number | null,"start_time"?: string | null,"title"?: string | null,"type"?: Database["public"]['Enums']["activity_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_activities_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_activities_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_forms": {
                  Row: {
                    "created_at": string,"default_source_id": string | null,"id": string,"is_active": boolean,"name": string,"org_id": string,"thank_you": string,"token": string
                  }
                  Insert: {
                    "created_at"?: string,"default_source_id"?: string | null,"id"?: string,"is_active"?: boolean,"name": string,"org_id": string,"thank_you"?: string,"token"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_source_id"?: string | null,"id"?: string,"is_active"?: boolean,"name"?: string,"org_id"?: string,"thank_you"?: string,"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_forms_default_source_id_fkey"
      columns: ["default_source_id"]
isOneToOne: false
      referencedRelation: "lead_sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_forms_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_salespeople": {
                  Row: {
                    "lead_id": string,"user_id": string
                  }
                  Insert: {
                    "lead_id": string,"user_id": string
                  }
                  Update: {
                    "lead_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_salespeople_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_salespeople_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_sources": {
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
      foreignKeyName: "lead_sources_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_statuses": {
                  Row: {
                    "category": Database["public"]['Enums']["lead_status_category"],"color": string,"id": string,"is_system": boolean,"name": string,"org_id": string,"sort": number
                  }
                  Insert: {
                    "category": Database["public"]['Enums']["lead_status_category"],"color"?: string,"id"?: string,"is_system"?: boolean,"name": string,"org_id": string,"sort"?: number
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["lead_status_category"],"color"?: string,"id"?: string,"is_system"?: boolean,"name"?: string,"org_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_statuses_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "confidence": number | null,"contact_email": string | null,"contact_first": string,"contact_last": string,"contact_phone": string | null,"converted_job_id": string | null,"created_at": string,"created_by": string | null,"custom": NonNullable<Json>,"deleted_at": string | null,"est_revenue_max": number | null,"est_revenue_min": number | null,"id": string,"lost_at": string | null,"lost_notes": string | null,"lost_reason_id": string | null,"notes": string | null,"org_id": string,"project_type_ids": (string)[],"projected_sale_date": string | null,"site_city": string | null,"site_postal": string | null,"site_province": string | null,"site_street": string | null,"sold_amount": number | null,"sold_at": string | null,"source_ids": (string)[],"status_changed_at": string,"status_id": string,"tag_ids": (string)[],"title": string,"updated_at": string
                  }
                  Insert: {
                    "confidence"?: number | null,"contact_email"?: string | null,"contact_first"?: string,"contact_last"?: string,"contact_phone"?: string | null,"converted_job_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"est_revenue_max"?: number | null,"est_revenue_min"?: number | null,"id"?: string,"lost_at"?: string | null,"lost_notes"?: string | null,"lost_reason_id"?: string | null,"notes"?: string | null,"org_id": string,"project_type_ids"?: (string)[],"projected_sale_date"?: string | null,"site_city"?: string | null,"site_postal"?: string | null,"site_province"?: string | null,"site_street"?: string | null,"sold_amount"?: number | null,"sold_at"?: string | null,"source_ids"?: (string)[],"status_changed_at"?: string,"status_id": string,"tag_ids"?: (string)[],"title": string,"updated_at"?: string
                  }
                  Update: {
                    "confidence"?: number | null,"contact_email"?: string | null,"contact_first"?: string,"contact_last"?: string,"contact_phone"?: string | null,"converted_job_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom"?: NonNullable<Json>,"deleted_at"?: string | null,"est_revenue_max"?: number | null,"est_revenue_min"?: number | null,"id"?: string,"lost_at"?: string | null,"lost_notes"?: string | null,"lost_reason_id"?: string | null,"notes"?: string | null,"org_id"?: string,"project_type_ids"?: (string)[],"projected_sale_date"?: string | null,"site_city"?: string | null,"site_postal"?: string | null,"site_province"?: string | null,"site_street"?: string | null,"sold_amount"?: number | null,"sold_at"?: string | null,"source_ids"?: (string)[],"status_changed_at"?: string,"status_id"?: string,"tag_ids"?: (string)[],"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_converted_job_id_fkey"
      columns: ["converted_job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_lost_reason_id_fkey"
      columns: ["lost_reason_id"]
isOneToOne: false
      referencedRelation: "lost_reasons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_status_id_fkey"
      columns: ["status_id"]
isOneToOne: false
      referencedRelation: "lead_statuses"
      referencedColumns: ["id"]
    }
                  ]
                },"lost_reasons": {
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
      foreignKeyName: "lost_reasons_org_id_fkey"
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
                },"plan_markups": {
                  Row: {
                    "author_id": string,"created_at": string,"id": string,"shapes": NonNullable<Json>,"sheet_id": string,"updated_at": string,"version": number,"visibility": Database["public"]['Enums']["markup_visibility"]
                  }
                  Insert: {
                    "author_id"?: string,"created_at"?: string,"id"?: string,"shapes"?: NonNullable<Json>,"sheet_id": string,"updated_at"?: string,"version": number,"visibility"?: Database["public"]['Enums']["markup_visibility"]
                  }
                  Update: {
                    "author_id"?: string,"created_at"?: string,"id"?: string,"shapes"?: NonNullable<Json>,"sheet_id"?: string,"updated_at"?: string,"version"?: number,"visibility"?: Database["public"]['Enums']["markup_visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_markups_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_markups_sheet_id_fkey"
      columns: ["sheet_id"]
isOneToOne: false
      referencedRelation: "plan_sheets"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_sheet_versions": {
                  Row: {
                    "created_at": string,"id": string,"mime": string,"note": string | null,"page": number,"sheet_id": string,"size_bytes": number,"status": string,"storage_key": string,"uploaded_by": string,"version": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"mime"?: string,"note"?: string | null,"page"?: number,"sheet_id": string,"size_bytes"?: number,"status"?: string,"storage_key": string,"uploaded_by"?: string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"mime"?: string,"note"?: string | null,"page"?: number,"sheet_id"?: string,"size_bytes"?: number,"status"?: string,"storage_key"?: string,"uploaded_by"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_sheet_versions_sheet_id_fkey"
      columns: ["sheet_id"]
isOneToOne: false
      referencedRelation: "plan_sheets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_sheet_versions_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_sheets": {
                  Row: {
                    "created_at": string,"created_by": string,"current_version": number,"deleted_at": string | null,"discipline": string | null,"id": string,"job_id": string,"number": string,"org_id": string,"share_clients": boolean,"share_subs": boolean,"title": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"current_version"?: number,"deleted_at"?: string | null,"discipline"?: string | null,"id"?: string,"job_id": string,"number": string,"org_id": string,"share_clients"?: boolean,"share_subs"?: boolean,"title"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"current_version"?: number,"deleted_at"?: string | null,"discipline"?: string | null,"id"?: string,"job_id"?: string,"number"?: string,"org_id"?: string,"share_clients"?: boolean,"share_subs"?: boolean,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_sheets_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_sheets_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_sheets_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"po_items": {
                  Row: {
                    "cost_code_id": string | null,"cost_type": Database["public"]['Enums']["cost_type"],"description": string | null,"id": string,"po_id": string,"quantity": number,"sort": number,"title": string,"unit": string,"unit_cost": number
                  }
                  Insert: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"description"?: string | null,"id"?: string,"po_id": string,"quantity"?: number,"sort"?: number,"title": string,"unit"?: string,"unit_cost"?: number
                  }
                  Update: {
                    "cost_code_id"?: string | null,"cost_type"?: Database["public"]['Enums']["cost_type"],"description"?: string | null,"id"?: string,"po_id"?: string,"quantity"?: number,"sort"?: number,"title"?: string,"unit"?: string,"unit_cost"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "po_items_cost_code_id_fkey"
      columns: ["cost_code_id"]
isOneToOne: false
      referencedRelation: "cost_codes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "po_items_po_id_fkey"
      columns: ["po_id"]
isOneToOne: false
      referencedRelation: "purchase_orders"
      referencedColumns: ["id"]
    }
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
                },"project_types": {
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
      foreignKeyName: "project_types_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"proposal_signatures": {
                  Row: {
                    "comment": string | null,"decision": string,"id": string,"ip": string | null,"on_behalf": boolean,"proposal_id": string,"signature": string | null,"signed_at": string,"signer_name": string,"signer_user_id": string | null,"user_agent": string | null
                  }
                  Insert: {
                    "comment"?: string | null,"decision": string,"id"?: string,"ip"?: string | null,"on_behalf"?: boolean,"proposal_id": string,"signature"?: string | null,"signed_at"?: string,"signer_name": string,"signer_user_id"?: string | null,"user_agent"?: string | null
                  }
                  Update: {
                    "comment"?: string | null,"decision"?: string,"id"?: string,"ip"?: string | null,"on_behalf"?: boolean,"proposal_id"?: string,"signature"?: string | null,"signed_at"?: string,"signer_name"?: string,"signer_user_id"?: string | null,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "proposal_signatures_proposal_id_fkey"
      columns: ["proposal_id"]
isOneToOne: false
      referencedRelation: "proposals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposal_signatures_signer_user_id_fkey"
      columns: ["signer_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"proposals": {
                  Row: {
                    "approval_deadline": string | null,"closing": string | null,"collect_signature": boolean,"created_at": string,"created_by": string,"decided_at": string | null,"estimate_id": string,"id": string,"intro": string | null,"job_id": string,"org_id": string,"released_at": string | null,"show_line_items": boolean,"show_quantities": boolean,"snapshot": Json | null,"status": Database["public"]['Enums']["proposal_status"],"subtotal": number | null,"tax": number | null,"tax_label": string | null,"title": string,"total": number | null
                  }
                  Insert: {
                    "approval_deadline"?: string | null,"closing"?: string | null,"collect_signature"?: boolean,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"estimate_id": string,"id"?: string,"intro"?: string | null,"job_id": string,"org_id": string,"released_at"?: string | null,"show_line_items"?: boolean,"show_quantities"?: boolean,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["proposal_status"],"subtotal"?: number | null,"tax"?: number | null,"tax_label"?: string | null,"title": string,"total"?: number | null
                  }
                  Update: {
                    "approval_deadline"?: string | null,"closing"?: string | null,"collect_signature"?: boolean,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"estimate_id"?: string,"id"?: string,"intro"?: string | null,"job_id"?: string,"org_id"?: string,"released_at"?: string | null,"show_line_items"?: boolean,"show_quantities"?: boolean,"snapshot"?: Json | null,"status"?: Database["public"]['Enums']["proposal_status"],"subtotal"?: number | null,"tax"?: number | null,"tax_label"?: string | null,"title"?: string,"total"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "proposals_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposals_estimate_id_fkey"
      columns: ["estimate_id"]
isOneToOne: false
      referencedRelation: "estimates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposals_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "proposals_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"purchase_orders": {
                  Row: {
                    "bid_request_id": string | null,"created_at": string,"created_by": string,"decided_at": string | null,"decided_by": string | null,"decline_reason": string | null,"deleted_at": string | null,"holdback_pct": number,"id": string,"job_id": string,"lien_waiver_required": boolean,"number": number,"org_id": string,"released_at": string | null,"scope": string | null,"signature": string | null,"signer_name": string | null,"status": Database["public"]['Enums']["po_status"],"sub_org_id": string | null,"title": string,"vendor_name": string | null,"work_status": Database["public"]['Enums']["work_status"]
                  }
                  Insert: {
                    "bid_request_id"?: string | null,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decline_reason"?: string | null,"deleted_at"?: string | null,"holdback_pct"?: number,"id"?: string,"job_id": string,"lien_waiver_required"?: boolean,"number": number,"org_id": string,"released_at"?: string | null,"scope"?: string | null,"signature"?: string | null,"signer_name"?: string | null,"status"?: Database["public"]['Enums']["po_status"],"sub_org_id"?: string | null,"title": string,"vendor_name"?: string | null,"work_status"?: Database["public"]['Enums']["work_status"]
                  }
                  Update: {
                    "bid_request_id"?: string | null,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decline_reason"?: string | null,"deleted_at"?: string | null,"holdback_pct"?: number,"id"?: string,"job_id"?: string,"lien_waiver_required"?: boolean,"number"?: number,"org_id"?: string,"released_at"?: string | null,"scope"?: string | null,"signature"?: string | null,"signer_name"?: string | null,"status"?: Database["public"]['Enums']["po_status"],"sub_org_id"?: string | null,"title"?: string,"vendor_name"?: string | null,"work_status"?: Database["public"]['Enums']["work_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "purchase_orders_bid_request_id_fkey"
      columns: ["bid_request_id"]
isOneToOne: false
      referencedRelation: "bid_requests"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "purchase_orders_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"record_attachments": {
                  Row: {
                    "created_at": string,"created_by": string,"file_id": string,"record_id": string,"record_type": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"file_id": string,"record_id": string,"record_type": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"file_id"?: string,"record_id"?: string,"record_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "record_attachments_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "record_attachments_file_id_fkey"
      columns: ["file_id"]
isOneToOne: false
      referencedRelation: "files"
      referencedColumns: ["id"]
    }
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
                },"schedule_assignees": {
                  Row: {
                    "id": string,"item_id": string,"responded_at": string | null,"responded_by": string | null,"status": Database["public"]['Enums']["confirm_status"],"sub_org_id": string | null,"user_id": string | null
                  }
                  Insert: {
                    "id"?: string,"item_id": string,"responded_at"?: string | null,"responded_by"?: string | null,"status"?: Database["public"]['Enums']["confirm_status"],"sub_org_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "id"?: string,"item_id"?: string,"responded_at"?: string | null,"responded_by"?: string | null,"status"?: Database["public"]['Enums']["confirm_status"],"sub_org_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_assignees_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "schedule_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_assignees_responded_by_fkey"
      columns: ["responded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_assignees_sub_org_id_fkey"
      columns: ["sub_org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_assignees_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_baselines": {
                  Row: {
                    "captured_at": string,"captured_by": string | null,"id": string,"items": NonNullable<Json>,"job_id": string
                  }
                  Insert: {
                    "captured_at"?: string,"captured_by"?: string | null,"id"?: string,"items": NonNullable<Json>,"job_id": string
                  }
                  Update: {
                    "captured_at"?: string,"captured_by"?: string | null,"id"?: string,"items"?: NonNullable<Json>,"job_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_baselines_captured_by_fkey"
      columns: ["captured_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_baselines_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_items": {
                  Row: {
                    "color": string | null,"completed_at": string | null,"created_at": string,"created_by": string,"deleted_at": string | null,"duration": number,"end_date": string,"end_time": string | null,"id": string,"is_hourly": boolean,"job_id": string,"notes_all": string | null,"notes_client": string | null,"notes_internal": string | null,"notes_sub": string | null,"org_id": string,"phase_id": string | null,"progress": number,"reminder_days": number | null,"show_client": boolean,"show_on_gantt": boolean,"show_subs": boolean,"start_date": string,"start_time": string | null,"title": string,"updated_at": string
                  }
                  Insert: {
                    "color"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"duration"?: number,"end_date": string,"end_time"?: string | null,"id"?: string,"is_hourly"?: boolean,"job_id": string,"notes_all"?: string | null,"notes_client"?: string | null,"notes_internal"?: string | null,"notes_sub"?: string | null,"org_id": string,"phase_id"?: string | null,"progress"?: number,"reminder_days"?: number | null,"show_client"?: boolean,"show_on_gantt"?: boolean,"show_subs"?: boolean,"start_date": string,"start_time"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "color"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"duration"?: number,"end_date"?: string,"end_time"?: string | null,"id"?: string,"is_hourly"?: boolean,"job_id"?: string,"notes_all"?: string | null,"notes_client"?: string | null,"notes_internal"?: string | null,"notes_sub"?: string | null,"org_id"?: string,"phase_id"?: string | null,"progress"?: number,"reminder_days"?: number | null,"show_client"?: boolean,"show_on_gantt"?: boolean,"show_subs"?: boolean,"start_date"?: string,"start_time"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_items_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_items_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_items_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_items_phase_id_fkey"
      columns: ["phase_id"]
isOneToOne: false
      referencedRelation: "schedule_phases"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_links": {
                  Row: {
                    "lag_days": number,"predecessor_id": string,"successor_id": string,"type": Database["public"]['Enums']["dep_type"]
                  }
                  Insert: {
                    "lag_days"?: number,"predecessor_id": string,"successor_id": string,"type"?: Database["public"]['Enums']["dep_type"]
                  }
                  Update: {
                    "lag_days"?: number,"predecessor_id"?: string,"successor_id"?: string,"type"?: Database["public"]['Enums']["dep_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_links_predecessor_id_fkey"
      columns: ["predecessor_id"]
isOneToOne: false
      referencedRelation: "schedule_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_links_successor_id_fkey"
      columns: ["successor_id"]
isOneToOne: false
      referencedRelation: "schedule_items"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_phases": {
                  Row: {
                    "color": string,"id": string,"job_id": string,"name": string,"org_id": string,"sort": number
                  }
                  Insert: {
                    "color"?: string,"id"?: string,"job_id": string,"name": string,"org_id": string,"sort"?: number
                  }
                  Update: {
                    "color"?: string,"id"?: string,"job_id"?: string,"name"?: string,"org_id"?: string,"sort"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_phases_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_phases_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"schedule_shifts": {
                  Row: {
                    "cascaded": boolean,"id": number,"item_id": string,"new_end": string,"new_start": string,"notes": string | null,"old_end": string,"old_start": string,"reason": string | null,"shifted_at": string,"shifted_by": string | null
                  }
                  Insert: {
                    "cascaded"?: boolean,"id"?: never,"item_id": string,"new_end": string,"new_start": string,"notes"?: string | null,"old_end": string,"old_start": string,"reason"?: string | null,"shifted_at"?: string,"shifted_by"?: string | null
                  }
                  Update: {
                    "cascaded"?: boolean,"id"?: never,"item_id"?: string,"new_end"?: string,"new_start"?: string,"notes"?: string | null,"old_end"?: string,"old_start"?: string,"reason"?: string | null,"shifted_at"?: string,"shifted_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "schedule_shifts_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "schedule_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "schedule_shifts_shifted_by_fkey"
      columns: ["shifted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"selection_choice_costs": {
                  Row: {
                    "builder_cost": number,"choice_id": string
                  }
                  Insert: {
                    "builder_cost"?: number,"choice_id": string
                  }
                  Update: {
                    "builder_cost"?: number,"choice_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "selection_choice_costs_choice_id_fkey"
      columns: ["choice_id"]
isOneToOne: true
      referencedRelation: "selection_choices"
      referencedColumns: ["id"]
    }
                  ]
                },"selection_choices": {
                  Row: {
                    "client_price": number,"created_at": string,"description": string | null,"id": string,"is_available": boolean,"product_code": string | null,"selection_id": string,"sort": number,"title": string,"vendor": string | null
                  }
                  Insert: {
                    "client_price"?: number,"created_at"?: string,"description"?: string | null,"id"?: string,"is_available"?: boolean,"product_code"?: string | null,"selection_id": string,"sort"?: number,"title": string,"vendor"?: string | null
                  }
                  Update: {
                    "client_price"?: number,"created_at"?: string,"description"?: string | null,"id"?: string,"is_available"?: boolean,"product_code"?: string | null,"selection_id"?: string,"sort"?: number,"title"?: string,"vendor"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "selection_choices_selection_id_fkey"
      columns: ["selection_id"]
isOneToOne: false
      referencedRelation: "selections"
      referencedColumns: ["id"]
    }
                  ]
                },"selections": {
                  Row: {
                    "allowance": number | null,"approved_at": string | null,"approved_by": string | null,"category": string | null,"change_order_id": string | null,"created_at": string,"created_by": string,"days_before": number | null,"deadline": string | null,"deleted_at": string | null,"id": string,"instructions": string | null,"job_id": string,"location": string | null,"org_id": string,"released_at": string | null,"schedule_item_id": string | null,"selected_at": string | null,"selected_by": string | null,"selected_choice_id": string | null,"share_client": boolean,"share_subs": boolean,"status": Database["public"]['Enums']["selection_status"],"title": string
                  }
                  Insert: {
                    "allowance"?: number | null,"approved_at"?: string | null,"approved_by"?: string | null,"category"?: string | null,"change_order_id"?: string | null,"created_at"?: string,"created_by"?: string,"days_before"?: number | null,"deadline"?: string | null,"deleted_at"?: string | null,"id"?: string,"instructions"?: string | null,"job_id": string,"location"?: string | null,"org_id": string,"released_at"?: string | null,"schedule_item_id"?: string | null,"selected_at"?: string | null,"selected_by"?: string | null,"selected_choice_id"?: string | null,"share_client"?: boolean,"share_subs"?: boolean,"status"?: Database["public"]['Enums']["selection_status"],"title": string
                  }
                  Update: {
                    "allowance"?: number | null,"approved_at"?: string | null,"approved_by"?: string | null,"category"?: string | null,"change_order_id"?: string | null,"created_at"?: string,"created_by"?: string,"days_before"?: number | null,"deadline"?: string | null,"deleted_at"?: string | null,"id"?: string,"instructions"?: string | null,"job_id"?: string,"location"?: string | null,"org_id"?: string,"released_at"?: string | null,"schedule_item_id"?: string | null,"selected_at"?: string | null,"selected_by"?: string | null,"selected_choice_id"?: string | null,"share_client"?: boolean,"share_subs"?: boolean,"status"?: Database["public"]['Enums']["selection_status"],"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "selections_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "selections_change_order_id_fkey"
      columns: ["change_order_id"]
isOneToOne: false
      referencedRelation: "change_orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "selections_choice_fk"
      columns: ["selected_choice_id"]
isOneToOne: false
      referencedRelation: "selection_choices"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "selections_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "selections_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "selections_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "selections_schedule_item_id_fkey"
      columns: ["schedule_item_id"]
isOneToOne: false
      referencedRelation: "schedule_items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "selections_selected_by_fkey"
      columns: ["selected_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"spec_documents": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string,"deleted_at": string | null,"division": string | null,"id": string,"job_id": string,"org_id": string,"share_clients": boolean,"share_subs": boolean,"title": string,"updated_at": string
                  }
                  Insert: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"division"?: string | null,"id"?: string,"job_id": string,"org_id": string,"share_clients"?: boolean,"share_subs"?: boolean,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"division"?: string | null,"id"?: string,"job_id"?: string,"org_id"?: string,"share_clients"?: boolean,"share_subs"?: boolean,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "spec_documents_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "spec_documents_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "spec_documents_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "organizations"
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
                },"workday_exceptions": {
                  Row: {
                    "category": string | null,"created_at": string,"end_date": string,"id": string,"job_id": string | null,"org_id": string,"repeat_annually": boolean,"start_date": string,"title": string,"type": Database["public"]['Enums']["workday_exception_type"]
                  }
                  Insert: {
                    "category"?: string | null,"created_at"?: string,"end_date": string,"id"?: string,"job_id"?: string | null,"org_id": string,"repeat_annually"?: boolean,"start_date": string,"title": string,"type": Database["public"]['Enums']["workday_exception_type"]
                  }
                  Update: {
                    "category"?: string | null,"created_at"?: string,"end_date"?: string,"id"?: string,"job_id"?: string | null,"org_id"?: string,"repeat_annually"?: boolean,"start_date"?: string,"title"?: string,"type"?: Database["public"]['Enums']["workday_exception_type"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "workday_exceptions_job_id_fkey"
      columns: ["job_id"]
isOneToOne: false
      referencedRelation: "jobs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workday_exceptions_org_id_fkey"
      columns: ["org_id"]
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
"apply_schedule_changes":
{ Args: { "p_cascaded_ids"?: (string)[],"p_changes": Json,"p_notes"?: string,"p_reason"?: string }; Returns: number
                           },
"approve_selection":
{ Args: { "p_create_co"?: boolean,"p_sel": string }; Returns: string
                           },
"award_bid":
{ Args: { "p_request": string }; Returns: string
                           },
"bill_holdback":
{ Args: { "p_bill": string }; Returns: number
                           },
"bill_subtotal":
{ Args: { "p_bill": string }; Returns: number
                           },
"can_see_bill":
{ Args: { "p_bill": string }; Returns: boolean
                           },
"can_see_change_order":
{ Args: { "p_co": string }; Returns: boolean
                           },
"can_see_po":
{ Args: { "p_po": string }; Returns: boolean
                           },
"can_see_selection":
{ Args: { "p_sel": string }; Returns: boolean
                           },
"can_see_sheet":
{ Args: { "p_sheet": string }; Returns: boolean
                           },
"choose_selection":
{ Args: { "p_choice": string,"p_sel": string }; Returns: undefined
                           },
"client_can":
{ Args: { "p_job": string,"p_key": string }; Returns: boolean
                           },
"clone_role":
{ Args: { "p_name": string,"p_role": string }; Returns: string
                           },
"co_item_price":
{ Args: { "i": Database["public"]['Tables']["change_order_items"]['Row'] }; Returns: number
                           },
"co_price_lines":
{ Args: { "p_co": string }; Returns: {
              "description": string,"id": string,"price": number,"quantity": number,"sort": number,"taxable": boolean,"title": string,"unit": string
            }[]
                           },
"convert_lead_to_job":
{ Args: { "p_amount"?: number,"p_contract"?: Database["public"]['Enums']["contract_type"],"p_lead": string,"p_title": string }; Returns: string
                           },
"create_builder_org":
{ Args: { "p_name": string,"p_province"?: string }; Returns: string
                           },
"create_sub_org":
{ Args: { "p_name": string }; Returns: string
                           },
"decide_change_order":
{ Args: { "p_co": string,"p_comment"?: string,"p_decision": string,"p_ip"?: string,"p_signature": string,"p_signer_name": string,"p_ua"?: string }; Returns: undefined
                           },
"decide_po":
{ Args: { "p_decision": string,"p_po": string,"p_reason"?: string,"p_signature": string,"p_signer_name": string }; Returns: undefined
                           },
"decide_proposal":
{ Args: { "p_comment"?: string,"p_decision": string,"p_ip"?: string,"p_proposal": string,"p_signature": string,"p_signer_name": string,"p_ua"?: string }; Returns: undefined
                           },
"decline_bid":
{ Args: { "p_reason"?: string,"p_request": string }; Returns: undefined
                           },
"estimate_price_lines":
{ Args: { "p_estimate": string }; Returns: {
              "description": string,"group_id": string,"id": string,"price": number,"quantity": number,"sort": number,"taxable": boolean,"title": string,"unit": string
            }[]
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
"item_cost":
{ Args: { "i": Database["public"]['Tables']["estimate_items"]['Row'] }; Returns: number
                           },
"item_price":
{ Args: { "i": Database["public"]['Tables']["estimate_items"]['Row'] }; Returns: number
                           },
"job_budget":
{ Args: { "p_job": string }; Returns: {
              "actual": number,"co_cost": number,"co_price": number,"committed": number,"cost_code_id": string,"cost_type": Database["public"]['Enums']["cost_type"],"original_cost": number,"original_price": number,"paid": number
            }[]
                           },
"lead_form_info":
{ Args: { "p_token": string }; Returns: {
              "form_name": string,"org_name": string,"thank_you": string
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
"pay_bill":
{ Args: { "p_bill": string,"p_method": string,"p_paid_on": string,"p_ref"?: string }; Returns: number
                           },
"po_holdback":
{ Args: { "p_po": string }; Returns: {
              "balance": number,"released": number,"withheld": number
            }[]
                           },
"po_total":
{ Args: { "p_po": string }; Returns: number
                           },
"release_bid_package":
{ Args: { "p_due"?: string,"p_package": string }; Returns: undefined
                           },
"release_change_order":
{ Args: { "p_co": string }; Returns: undefined
                           },
"release_holdback":
{ Args: { "p_po": string }; Returns: string
                           },
"release_po":
{ Args: { "p_po": string }; Returns: undefined
                           },
"release_proposal":
{ Args: { "p_proposal": string }; Returns: undefined
                           },
"release_selection":
{ Args: { "p_sel": string }; Returns: undefined
                           },
"resolve_share_link":
{ Args: { "p_token": string }; Returns: {
              "mime": string,"name": string,"size_bytes": number,"storage_key": string
            }[]
                           },
"respond_schedule_item":
{ Args: { "p_confirm": boolean,"p_item": string }; Returns: undefined
                           },
"save_change_order":
{ Args: { "p_co": string,"p_items": Json,"p_settings": Json }; Returns: undefined
                           },
"save_estimate":
{ Args: { "p_estimate": string,"p_groups": Json,"p_items": Json,"p_settings": Json }; Returns: undefined
                           },
"selection_choices_public":
{ Args: { "p_sel": string }; Returns: {
              "description": string,"id": string,"is_available": boolean,"product_code": string,"sort": number,"title": string,"vendor": string
            }[]
                           },
"send_estimate_to_budget":
{ Args: { "p_estimate": string }; Returns: undefined
                           },
"set_active_org":
{ Args: { "p_org": string }; Returns: undefined
                           },
"set_bill_status":
{ Args: { "p_action": string,"p_bill": string,"p_reason"?: string }; Returns: undefined
                           },
"set_checklist_item":
{ Args: { "p_done": boolean,"p_item": string }; Returns: undefined
                           },
"set_job_selection":
{ Args: { "p_all": boolean,"p_job_ids": (string)[],"p_org": string }; Returns: undefined
                           },
"set_po_work_status":
{ Args: { "p_po": string,"p_status": Database["public"]['Enums']["work_status"] }; Returns: undefined
                           },
"set_rfi_status":
{ Args: { "p_action": string,"p_rfi": string }; Returns: undefined
                           },
"set_todo_complete":
{ Args: { "p_done": boolean,"p_todo": string }; Returns: undefined
                           },
"submit_bid":
{ Args: { "p_notes"?: string,"p_prices": Json,"p_request": string }; Returns: undefined
                           },
"submit_lead_form":
{ Args: { "p_payload": Json,"p_token": string }; Returns: boolean
                           },
"unlock_estimate":
{ Args: { "p_estimate": string }; Returns: undefined
                           },
"unlock_selection":
{ Args: { "p_sel": string }; Returns: undefined
                           },
"update_my_sub_profile":
{ Args: { "p_link": string,"p_profile": Json }; Returns: undefined
                           }
          }
          Enums: {
            "activity_type": "call"|"email"|"meeting"|"follow_up"|"website_form"|"note"|"sms","bid_package_status": "draft"|"open"|"closed"|"awarded","bid_request_status": "invited"|"submitted"|"declined"|"awarded"|"not_awarded","bill_status": "draft"|"submitted"|"approved"|"paid"|"rejected","co_status": "draft"|"pending"|"approved"|"declined","confirm_status": "pending"|"confirmed"|"declined","contract_type": "fixed_price"|"open_book","cost_type": "labor"|"material"|"equipment"|"subcontractor"|"other"|"none","delivery_channel": "email"|"text"|"push","delivery_status": "queued"|"sent"|"failed"|"skipped","dep_type": "FS"|"SS","field_type": "text"|"long_text"|"number"|"currency"|"date"|"boolean"|"single_select"|"multi_select"|"file"|"hyperlink","file_kind": "documents"|"photos"|"videos","file_status": "pending"|"ready","invite_kind": "internal"|"sub"|"client","job_status": "presale"|"open"|"warranty"|"closed","lead_status_category": "open"|"won"|"lost"|"inactive","link_status": "active"|"inactive","log_status": "draft"|"published","marked_as": "none"|"allowance"|"bid"|"selection","markup_type": "percent"|"amount","markup_visibility": "private"|"team"|"shared","member_status": "active"|"inactive"|"archived","option_status": "pending"|"approved"|"declined","org_kind": "builder"|"sub","perm_scope": "all"|"assigned"|"own","po_status": "draft"|"released"|"accepted"|"declined"|"void","proposal_status": "draft"|"released"|"approved"|"declined","rfi_status": "not_sent"|"sent"|"completed"|"reopened","selection_status": "draft"|"pending"|"selected"|"approved","todo_priority": "low"|"medium"|"high","work_status": "not_started"|"in_progress"|"complete","workday_exception_type": "non_workday"|"extra_workday"
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
            "activity_type": ["call", "email", "meeting", "follow_up", "website_form", "note", "sms"],"bid_package_status": ["draft", "open", "closed", "awarded"],"bid_request_status": ["invited", "submitted", "declined", "awarded", "not_awarded"],"bill_status": ["draft", "submitted", "approved", "paid", "rejected"],"co_status": ["draft", "pending", "approved", "declined"],"confirm_status": ["pending", "confirmed", "declined"],"contract_type": ["fixed_price", "open_book"],"cost_type": ["labor", "material", "equipment", "subcontractor", "other", "none"],"delivery_channel": ["email", "text", "push"],"delivery_status": ["queued", "sent", "failed", "skipped"],"dep_type": ["FS", "SS"],"field_type": ["text", "long_text", "number", "currency", "date", "boolean", "single_select", "multi_select", "file", "hyperlink"],"file_kind": ["documents", "photos", "videos"],"file_status": ["pending", "ready"],"invite_kind": ["internal", "sub", "client"],"job_status": ["presale", "open", "warranty", "closed"],"lead_status_category": ["open", "won", "lost", "inactive"],"link_status": ["active", "inactive"],"log_status": ["draft", "published"],"marked_as": ["none", "allowance", "bid", "selection"],"markup_type": ["percent", "amount"],"markup_visibility": ["private", "team", "shared"],"member_status": ["active", "inactive", "archived"],"option_status": ["pending", "approved", "declined"],"org_kind": ["builder", "sub"],"perm_scope": ["all", "assigned", "own"],"po_status": ["draft", "released", "accepted", "declined", "void"],"proposal_status": ["draft", "released", "approved", "declined"],"rfi_status": ["not_sent", "sent", "completed", "reopened"],"selection_status": ["draft", "pending", "selected", "approved"],"todo_priority": ["low", "medium", "high"],"work_status": ["not_started", "in_progress", "complete"],"workday_exception_type": ["non_workday", "extra_workday"]
          }
        }
} as const

