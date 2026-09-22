export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      aet_autorizacoes: {
        Row: {
          created_at: string
          documento_url: string | null
          id: string
          rota: string | null
          validade: string | null
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          documento_url?: string | null
          id?: string
          rota?: string | null
          validade?: string | null
          veiculo_id: string
        }
        Update: {
          created_at?: string
          documento_url?: string | null
          id?: string
          rota?: string | null
          validade?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aet_autorizacoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "aet_autorizacoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      agenciador_faixa_override: {
        Row: {
          id: number
          max_qtd: number | null
          min_qtd: number
          percentual: number
        }
        Insert: {
          id?: never
          max_qtd?: number | null
          min_qtd: number
          percentual: number
        }
        Update: {
          id?: never
          max_qtd?: number | null
          min_qtd?: number
          percentual?: number
        }
        Relationships: []
      }
      apolices_seguro: {
        Row: {
          created_at: string
          faixa_risco: string | null
          id: string
          taxa_tag_seguro: number | null
          teto_cobertura_por_embarque: number
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          created_at?: string
          faixa_risco?: string | null
          id?: string
          taxa_tag_seguro?: number | null
          teto_cobertura_por_embarque: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          created_at?: string
          faixa_risco?: string | null
          id?: string
          taxa_tag_seguro?: number | null
          teto_cobertura_por_embarque?: number
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: []
      }
      aprovacoes_lancamento: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string
          id: string
          limite_configuravel_excedido: boolean
          referencia_id: string | null
          tipo_lancamento: string
          valor: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          id?: string
          limite_configuravel_excedido?: boolean
          referencia_id?: string | null
          tipo_lancamento: string
          valor: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string
          id?: string
          limite_configuravel_excedido?: boolean
          referencia_id?: string | null
          tipo_lancamento?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "aprovacoes_lancamento_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aprovacoes_lancamento_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "aprovacoes_lancamento_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      apuracao_impostos: {
        Row: {
          competencia: string
          created_at: string
          faixa_aplicada: string | null
          faturamento_base: number | null
          id: string
          imposto_devido: number | null
        }
        Insert: {
          competencia: string
          created_at?: string
          faixa_aplicada?: string | null
          faturamento_base?: number | null
          id?: string
          imposto_devido?: number | null
        }
        Update: {
          competencia?: string
          created_at?: string
          faixa_aplicada?: string | null
          faturamento_base?: number | null
          id?: string
          imposto_devido?: number | null
        }
        Relationships: []
      }
      assinaturas_motorista: {
        Row: {
          created_at: string
          dia_vencimento: number | null
          forma_cobranca: string
          id: string
          motorista_titular_id: string
          qtd_indicacoes_convertidas: number
          status: Database["public"]["Enums"]["status_assinatura"]
          teto_autorizado: number
          updated_at: string
          valor_atual: number
          valor_base: number
          veiculo_id: string
        }
        Insert: {
          created_at?: string
          dia_vencimento?: number | null
          forma_cobranca?: string
          id?: string
          motorista_titular_id: string
          qtd_indicacoes_convertidas?: number
          status?: Database["public"]["Enums"]["status_assinatura"]
          teto_autorizado: number
          updated_at?: string
          valor_atual?: number
          valor_base?: number
          veiculo_id: string
        }
        Update: {
          created_at?: string
          dia_vencimento?: number | null
          forma_cobranca?: string
          id?: string
          motorista_titular_id?: string
          qtd_indicacoes_convertidas?: number
          status?: Database["public"]["Enums"]["status_assinatura"]
          teto_autorizado?: number
          updated_at?: string
          valor_atual?: number
          valor_base?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_motorista_motorista_titular_id_fkey"
            columns: ["motorista_titular_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_motorista_motorista_titular_id_fkey"
            columns: ["motorista_titular_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "assinaturas_motorista_motorista_titular_id_fkey"
            columns: ["motorista_titular_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "assinaturas_motorista_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: true
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "assinaturas_motorista_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: true
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_financeira: {
        Row: {
          executado_em: string
          executado_por: string | null
          id: number
          operacao_log: string
          payload_antes: Json | null
          payload_depois: Json | null
          registro_id: string
          tabela_origem: string
        }
        Insert: {
          executado_em?: string
          executado_por?: string | null
          id?: never
          operacao_log: string
          payload_antes?: Json | null
          payload_depois?: Json | null
          registro_id: string
          tabela_origem: string
        }
        Update: {
          executado_em?: string
          executado_por?: string | null
          id?: never
          operacao_log?: string
          payload_antes?: Json | null
          payload_depois?: Json | null
          registro_id?: string
          tabela_origem?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_financeira_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_financeira_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "auditoria_financeira_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      auditoria_log: {
        Row: {
          acao: string
          created_at: string
          dado_antes: Json | null
          dado_depois: Json | null
          entidade: string
          entidade_id: string | null
          id: number
          papel: string | null
          pessoa_id_ator: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          dado_antes?: Json | null
          dado_depois?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: never
          papel?: string | null
          pessoa_id_ator?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          dado_antes?: Json | null
          dado_depois?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: never
          papel?: string | null
          pessoa_id_ator?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_log_pessoa_id_ator_fkey"
            columns: ["pessoa_id_ator"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_log_pessoa_id_ator_fkey"
            columns: ["pessoa_id_ator"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "auditoria_log_pessoa_id_ator_fkey"
            columns: ["pessoa_id_ator"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      autorizacoes_aet: {
        Row: {
          atualizado_por: string | null
          created_at: string
          created_by: string | null
          data_emissao: string | null
          data_solicitacao: string | null
          data_validade: string | null
          id: string
          itinerario_aprovado: string | null
          numero_aet: string | null
          observacoes: string | null
          operacao_id: string
          prazo_estimado_dias: number
          protocolo_siaet: string | null
          status: Database["public"]["Enums"]["status_aet"]
          updated_at: string
        }
        Insert: {
          atualizado_por?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          data_solicitacao?: string | null
          data_validade?: string | null
          id?: string
          itinerario_aprovado?: string | null
          numero_aet?: string | null
          observacoes?: string | null
          operacao_id: string
          prazo_estimado_dias?: number
          protocolo_siaet?: string | null
          status?: Database["public"]["Enums"]["status_aet"]
          updated_at?: string
        }
        Update: {
          atualizado_por?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string | null
          data_solicitacao?: string | null
          data_validade?: string | null
          id?: string
          itinerario_aprovado?: string | null
          numero_aet?: string | null
          observacoes?: string | null
          operacao_id?: string
          prazo_estimado_dias?: number
          protocolo_siaet?: string | null
          status?: Database["public"]["Enums"]["status_aet"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_aet_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_aet_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "autorizacoes_aet_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "autorizacoes_aet_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_aet_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "autorizacoes_aet_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "autorizacoes_aet_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autorizacoes_aet_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      averbacoes_negociacao: {
        Row: {
          created_at: string
          id: string
          negociado_por: string | null
          operacao_id: string
          resolvido_em: string | null
          sla_prazo: string | null
          status: Database["public"]["Enums"]["status_averbacao"]
        }
        Insert: {
          created_at?: string
          id?: string
          negociado_por?: string | null
          operacao_id: string
          resolvido_em?: string | null
          sla_prazo?: string | null
          status?: Database["public"]["Enums"]["status_averbacao"]
        }
        Update: {
          created_at?: string
          id?: string
          negociado_por?: string | null
          operacao_id?: string
          resolvido_em?: string | null
          sla_prazo?: string | null
          status?: Database["public"]["Enums"]["status_averbacao"]
        }
        Relationships: [
          {
            foreignKeyName: "averbacoes_negociacao_negociado_por_fkey"
            columns: ["negociado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "averbacoes_negociacao_negociado_por_fkey"
            columns: ["negociado_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "averbacoes_negociacao_negociado_por_fkey"
            columns: ["negociado_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "averbacoes_negociacao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "averbacoes_negociacao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      base_conhecimento_ia: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string
          conteudo: string
          criado_em: string
          fonte: string | null
          id: string
          tags: string[]
          titulo: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria: string
          conteudo: string
          criado_em?: string
          fonte?: string | null
          id?: string
          tags?: string[]
          titulo: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string
          conteudo?: string
          criado_em?: string
          fonte?: string | null
          id?: string
          tags?: string[]
          titulo?: string
        }
        Relationships: []
      }
      bloqueios_acesso_veiculo: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          motivo: string
          prazo_carencia_dias: number
          resolvido_em: string | null
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          motivo: string
          prazo_carencia_dias?: number
          resolvido_em?: string | null
          veiculo_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          motivo?: string
          prazo_carencia_dias?: number
          resolvido_em?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueios_acesso_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "bloqueios_acesso_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      ciot_registros: {
        Row: {
          condicao_pagamento_id: string
          emitido_em: string | null
          id: string
          numero_ciot: string | null
          operacao_id: string
          pagador: string
          provedor: string
          status: Database["public"]["Enums"]["status_documento_fiscal"]
        }
        Insert: {
          condicao_pagamento_id: string
          emitido_em?: string | null
          id?: string
          numero_ciot?: string | null
          operacao_id: string
          pagador: string
          provedor?: string
          status?: Database["public"]["Enums"]["status_documento_fiscal"]
        }
        Update: {
          condicao_pagamento_id?: string
          emitido_em?: string | null
          id?: string
          numero_ciot?: string | null
          operacao_id?: string
          pagador?: string
          provedor?: string
          status?: Database["public"]["Enums"]["status_documento_fiscal"]
        }
        Relationships: [
          {
            foreignKeyName: "ciot_registros_condicao_pagamento_id_fkey"
            columns: ["condicao_pagamento_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento_operacao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciot_registros_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ciot_registros_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      clientes: {
        Row: {
          agenciador_id: string | null
          bairro: string | null
          celular_whatsapp: string | null
          cep: string | null
          cidade: string | null
          cnae: string | null
          cnpj: string | null
          complemento: string | null
          condicoes_pagamento_prazo: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          logradouro: string | null
          nome_contato_comercial: string | null
          nome_fantasia: string | null
          numero_endereco: string | null
          origem: string
          razao_social: string | null
          situacao_cadastral: string | null
          status: Database["public"]["Enums"]["status_ciclo_vida"]
          uf: string | null
          updated_at: string
        }
        Insert: {
          agenciador_id?: string | null
          bairro?: string | null
          celular_whatsapp?: string | null
          cep?: string | null
          cidade?: string | null
          cnae?: string | null
          cnpj?: string | null
          complemento?: string | null
          condicoes_pagamento_prazo?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome_contato_comercial?: string | null
          nome_fantasia?: string | null
          numero_endereco?: string | null
          origem?: string
          razao_social?: string | null
          situacao_cadastral?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          uf?: string | null
          updated_at?: string
        }
        Update: {
          agenciador_id?: string | null
          bairro?: string | null
          celular_whatsapp?: string | null
          cep?: string | null
          cidade?: string | null
          cnae?: string | null
          cnpj?: string | null
          complemento?: string | null
          condicoes_pagamento_prazo?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome_contato_comercial?: string | null
          nome_fantasia?: string | null
          numero_endereco?: string | null
          origem?: string
          razao_social?: string | null
          situacao_cadastral?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "clientes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      comissao_agenciador_eventos: {
        Row: {
          agenciador_id: string
          created_at: string
          data: string
          evento: string
          id: number
          veiculo_id: string | null
        }
        Insert: {
          agenciador_id: string
          created_at?: string
          data: string
          evento: string
          id?: never
          veiculo_id?: string | null
        }
        Update: {
          agenciador_id?: string
          created_at?: string
          data?: string
          evento?: string
          id?: never
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comissao_agenciador_eventos_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissao_agenciador_eventos_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "comissao_agenciador_eventos_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "comissao_agenciador_eventos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "comissao_agenciador_eventos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_agenciador: {
        Row: {
          agenciador_id: string
          base_ativa_qtd: number
          competencia: string
          created_at: string
          creditado_em: string | null
          id: string
          percentual_aplicado: number
          status: Database["public"]["Enums"]["status_comissao_agenciador"]
          valor_calculado: number
        }
        Insert: {
          agenciador_id: string
          base_ativa_qtd: number
          competencia: string
          created_at?: string
          creditado_em?: string | null
          id?: string
          percentual_aplicado: number
          status?: Database["public"]["Enums"]["status_comissao_agenciador"]
          valor_calculado: number
        }
        Update: {
          agenciador_id?: string
          base_ativa_qtd?: number
          competencia?: string
          created_at?: string
          creditado_em?: string | null
          id?: string
          percentual_aplicado?: number
          status?: Database["public"]["Enums"]["status_comissao_agenciador"]
          valor_calculado?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "comissoes_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      conciliacoes_bancarias: {
        Row: {
          banco: string
          conciliado_em: string | null
          created_at: string
          extrato_item_id: string
          id: string
          lancamento_sistema_id: string | null
          status: string
        }
        Insert: {
          banco: string
          conciliado_em?: string | null
          created_at?: string
          extrato_item_id: string
          id?: string
          lancamento_sistema_id?: string | null
          status?: string
        }
        Update: {
          banco?: string
          conciliado_em?: string | null
          created_at?: string
          extrato_item_id?: string
          id?: string
          lancamento_sistema_id?: string | null
          status?: string
        }
        Relationships: []
      }
      condicoes_pagamento_operacao: {
        Row: {
          aceito_pelo_motorista_em: string | null
          created_at: string
          id: string
          meio_pagamento: Database["public"]["Enums"]["meio_pagamento"]
          operacao_id: string
          origem: Database["public"]["Enums"]["origem_operacao"]
          percentual_adiantamento: number | null
          tipo: Database["public"]["Enums"]["tipo_pagamento_prazo"]
          updated_at: string
          valor_adiantamento: number | null
          valor_total_contrato: number
        }
        Insert: {
          aceito_pelo_motorista_em?: string | null
          created_at?: string
          id?: string
          meio_pagamento: Database["public"]["Enums"]["meio_pagamento"]
          operacao_id: string
          origem: Database["public"]["Enums"]["origem_operacao"]
          percentual_adiantamento?: number | null
          tipo: Database["public"]["Enums"]["tipo_pagamento_prazo"]
          updated_at?: string
          valor_adiantamento?: number | null
          valor_total_contrato: number
        }
        Update: {
          aceito_pelo_motorista_em?: string | null
          created_at?: string
          id?: string
          meio_pagamento?: Database["public"]["Enums"]["meio_pagamento"]
          operacao_id?: string
          origem?: Database["public"]["Enums"]["origem_operacao"]
          percentual_adiantamento?: number | null
          tipo?: Database["public"]["Enums"]["tipo_pagamento_prazo"]
          updated_at?: string
          valor_adiantamento?: number | null
          valor_total_contrato?: number
        }
        Relationships: [
          {
            foreignKeyName: "condicoes_pagamento_operacao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "condicoes_pagamento_operacao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      configuracoes_lgpd: {
        Row: {
          chave: string
          valor: string
        }
        Insert: {
          chave: string
          valor: string
        }
        Update: {
          chave?: string
          valor?: string
        }
        Relationships: []
      }
      contratos_aceite: {
        Row: {
          aceito_em: string
          hash_documento: string | null
          id: string
          ip_aceite: string | null
          parte_id: string
          parte_tipo: string
          versao_contrato: string
        }
        Insert: {
          aceito_em?: string
          hash_documento?: string | null
          id?: string
          ip_aceite?: string | null
          parte_id: string
          parte_tipo: string
          versao_contrato: string
        }
        Update: {
          aceito_em?: string
          hash_documento?: string | null
          id?: string
          ip_aceite?: string | null
          parte_id?: string
          parte_tipo?: string
          versao_contrato?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_aceite_parte_id_fkey"
            columns: ["parte_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_aceite_parte_id_fkey"
            columns: ["parte_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "contratos_aceite_parte_id_fkey"
            columns: ["parte_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          agenciador_id: string | null
          checkbox_carga_indivisivel_manual: boolean
          checkbox_carga_perigosa_manual: boolean
          cidade_destino: string | null
          cidade_origem: string | null
          cliente_id: string | null
          created_at: string
          distancia_km: number | null
          eixos: number | null
          flag_peso_acima_limiar: boolean
          flag_valor_acima_teto_seguro: boolean
          id: string
          lucro_rbr: number | null
          margem_ajustada: number | null
          natureza_operacao: string | null
          ncms_produtos: string[] | null
          nf_chave_acesso: string | null
          nf_destinatario_cnpj: string | null
          nf_destinatario_razao_social: string | null
          nf_remetente_cnpj: string | null
          nf_remetente_razao_social: string | null
          origem: string
          pedagio: number | null
          peso_bruto_kg: number | null
          piso_antt_calculado: number | null
          projeto_id: string | null
          status: Database["public"]["Enums"]["status_cotacao"]
          tipo_carga: string | null
          uf_destino: string | null
          uf_origem: string | null
          updated_at: string
          valor_nf: number | null
          valor_seguro_tag: number | null
          valor_total: number | null
          xml_danfe_url: string | null
        }
        Insert: {
          agenciador_id?: string | null
          checkbox_carga_indivisivel_manual?: boolean
          checkbox_carga_perigosa_manual?: boolean
          cidade_destino?: string | null
          cidade_origem?: string | null
          cliente_id?: string | null
          created_at?: string
          distancia_km?: number | null
          eixos?: number | null
          flag_peso_acima_limiar?: boolean
          flag_valor_acima_teto_seguro?: boolean
          id?: string
          lucro_rbr?: number | null
          margem_ajustada?: number | null
          natureza_operacao?: string | null
          ncms_produtos?: string[] | null
          nf_chave_acesso?: string | null
          nf_destinatario_cnpj?: string | null
          nf_destinatario_razao_social?: string | null
          nf_remetente_cnpj?: string | null
          nf_remetente_razao_social?: string | null
          origem?: string
          pedagio?: number | null
          peso_bruto_kg?: number | null
          piso_antt_calculado?: number | null
          projeto_id?: string | null
          status?: Database["public"]["Enums"]["status_cotacao"]
          tipo_carga?: string | null
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
          valor_nf?: number | null
          valor_seguro_tag?: number | null
          valor_total?: number | null
          xml_danfe_url?: string | null
        }
        Update: {
          agenciador_id?: string | null
          checkbox_carga_indivisivel_manual?: boolean
          checkbox_carga_perigosa_manual?: boolean
          cidade_destino?: string | null
          cidade_origem?: string | null
          cliente_id?: string | null
          created_at?: string
          distancia_km?: number | null
          eixos?: number | null
          flag_peso_acima_limiar?: boolean
          flag_valor_acima_teto_seguro?: boolean
          id?: string
          lucro_rbr?: number | null
          margem_ajustada?: number | null
          natureza_operacao?: string | null
          ncms_produtos?: string[] | null
          nf_chave_acesso?: string | null
          nf_destinatario_cnpj?: string | null
          nf_destinatario_razao_social?: string | null
          nf_remetente_cnpj?: string | null
          nf_remetente_razao_social?: string | null
          origem?: string
          pedagio?: number | null
          peso_bruto_kg?: number | null
          piso_antt_calculado?: number | null
          projeto_id?: string | null
          status?: Database["public"]["Enums"]["status_cotacao"]
          tipo_carga?: string | null
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
          valor_nf?: number | null
          valor_seguro_tag?: number | null
          valor_total?: number | null
          xml_danfe_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotacoes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "cotacoes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "cotacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotacoes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      documentacao_operacao: {
        Row: {
          ambiente: string | null
          atualizado_em: string | null
          chave_acesso: string | null
          created_at: string
          disponivel_para_agenciador: boolean
          emitido_em: string | null
          id: string
          mensagem_erro: string | null
          numero_documento: string | null
          operacao_id: string
          payload_enviado: Json | null
          payload_resposta: Json | null
          piso_antt_ok: boolean | null
          provedor: string | null
          referencia: string | null
          rntrc_referenciado: string | null
          status: Database["public"]["Enums"]["status_documento_fiscal"]
          tipo: Database["public"]["Enums"]["tipo_documento_fiscal"]
          url_pdf: string | null
        }
        Insert: {
          ambiente?: string | null
          atualizado_em?: string | null
          chave_acesso?: string | null
          created_at?: string
          disponivel_para_agenciador?: boolean
          emitido_em?: string | null
          id?: string
          mensagem_erro?: string | null
          numero_documento?: string | null
          operacao_id: string
          payload_enviado?: Json | null
          payload_resposta?: Json | null
          piso_antt_ok?: boolean | null
          provedor?: string | null
          referencia?: string | null
          rntrc_referenciado?: string | null
          status?: Database["public"]["Enums"]["status_documento_fiscal"]
          tipo: Database["public"]["Enums"]["tipo_documento_fiscal"]
          url_pdf?: string | null
        }
        Update: {
          ambiente?: string | null
          atualizado_em?: string | null
          chave_acesso?: string | null
          created_at?: string
          disponivel_para_agenciador?: boolean
          emitido_em?: string | null
          id?: string
          mensagem_erro?: string | null
          numero_documento?: string | null
          operacao_id?: string
          payload_enviado?: Json | null
          payload_resposta?: Json | null
          piso_antt_ok?: boolean | null
          provedor?: string | null
          referencia?: string | null
          rntrc_referenciado?: string | null
          status?: Database["public"]["Enums"]["status_documento_fiscal"]
          tipo?: Database["public"]["Enums"]["tipo_documento_fiscal"]
          url_pdf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentacao_operacao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentacao_operacao_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      documentos_pessoais_imagens: {
        Row: {
          arquivo_url: string | null
          campos_extraidos: Json | null
          created_at: string
          id: string
          inativado_em: string | null
          pessoa_id: string | null
          status: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo: string
          veiculo_id: string | null
        }
        Insert: {
          arquivo_url?: string | null
          campos_extraidos?: Json | null
          created_at?: string
          id?: string
          inativado_em?: string | null
          pessoa_id?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo: string
          veiculo_id?: string | null
        }
        Update: {
          arquivo_url?: string | null
          campos_extraidos?: Json | null
          created_at?: string
          id?: string
          inativado_em?: string | null
          pessoa_id?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_pessoais_imagens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pessoais_imagens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "documentos_pessoais_imagens_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "documentos_pessoais_imagens_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "documentos_pessoais_imagens_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      duplas_checagens_pagamento: {
        Row: {
          aprovado_em: string | null
          aprovador_1: string | null
          aprovador_2: string | null
          created_at: string
          gatilho: string
          id: string
          pagamento_id: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovador_1?: string | null
          aprovador_2?: string | null
          created_at?: string
          gatilho: string
          id?: string
          pagamento_id: string
        }
        Update: {
          aprovado_em?: string | null
          aprovador_1?: string | null
          aprovador_2?: string | null
          created_at?: string
          gatilho?: string
          id?: string
          pagamento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duplas_checagens_pagamento_aprovador_1_fkey"
            columns: ["aprovador_1"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplas_checagens_pagamento_aprovador_1_fkey"
            columns: ["aprovador_1"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "duplas_checagens_pagamento_aprovador_1_fkey"
            columns: ["aprovador_1"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "duplas_checagens_pagamento_aprovador_2_fkey"
            columns: ["aprovador_2"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "duplas_checagens_pagamento_aprovador_2_fkey"
            columns: ["aprovador_2"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "duplas_checagens_pagamento_aprovador_2_fkey"
            columns: ["aprovador_2"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "duplas_checagens_pagamento_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos_motorista"
            referencedColumns: ["id"]
          },
        ]
      }
      faturas: {
        Row: {
          cliente_id: string
          cotacao_id: string | null
          created_at: string
          data_emissao: string
          data_pagamento: string | null
          data_vencimento: string
          forma_cobranca: string
          id: string
          operacao_id: string | null
          pix_txid: string | null
          status: Database["public"]["Enums"]["status_fatura"]
          updated_at: string
          valor_total: number
        }
        Insert: {
          cliente_id: string
          cotacao_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento: string
          forma_cobranca?: string
          id?: string
          operacao_id?: string | null
          pix_txid?: string | null
          status?: Database["public"]["Enums"]["status_fatura"]
          updated_at?: string
          valor_total: number
        }
        Update: {
          cliente_id?: string
          cotacao_id?: string | null
          created_at?: string
          data_emissao?: string
          data_pagamento?: string | null
          data_vencimento?: string
          forma_cobranca?: string
          id?: string
          operacao_id?: string | null
          pix_txid?: string | null
          status?: Database["public"]["Enums"]["status_fatura"]
          updated_at?: string
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["cotacao_id"]
          },
          {
            foreignKeyName: "faturas_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      faturas_assinatura: {
        Row: {
          competencia: string
          created_at: string
          data_pagamento: string | null
          data_vencimento: string | null
          id: string
          motorista_titular_id: string
          status: Database["public"]["Enums"]["status_fatura"]
          valor_total: number
        }
        Insert: {
          competencia: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          id?: string
          motorista_titular_id: string
          status?: Database["public"]["Enums"]["status_fatura"]
          valor_total: number
        }
        Update: {
          competencia?: string
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string | null
          id?: string
          motorista_titular_id?: string
          status?: Database["public"]["Enums"]["status_fatura"]
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_assinatura_motorista_titular_id_fkey"
            columns: ["motorista_titular_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_assinatura_motorista_titular_id_fkey"
            columns: ["motorista_titular_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "faturas_assinatura_motorista_titular_id_fkey"
            columns: ["motorista_titular_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      faturas_assinatura_itens: {
        Row: {
          assinatura_motorista_id: string
          fatura_assinatura_id: string
          id: string
          valor_no_ciclo: number
        }
        Insert: {
          assinatura_motorista_id: string
          fatura_assinatura_id: string
          id?: string
          valor_no_ciclo: number
        }
        Update: {
          assinatura_motorista_id?: string
          fatura_assinatura_id?: string
          id?: string
          valor_no_ciclo?: number
        }
        Relationships: [
          {
            foreignKeyName: "faturas_assinatura_itens_assinatura_motorista_id_fkey"
            columns: ["assinatura_motorista_id"]
            isOneToOne: false
            referencedRelation: "assinaturas_motorista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faturas_assinatura_itens_fatura_assinatura_id_fkey"
            columns: ["fatura_assinatura_id"]
            isOneToOne: false
            referencedRelation: "faturas_assinatura"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          celular: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          pix: string | null
          razao_social: string | null
          status: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo_pessoa_doc: Database["public"]["Enums"]["tipo_pessoa_doc"]
          tipo_servico_fornecido: string | null
          updated_at: string
        }
        Insert: {
          celular?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          pix?: string | null
          razao_social?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo_pessoa_doc?: Database["public"]["Enums"]["tipo_pessoa_doc"]
          tipo_servico_fornecido?: string | null
          updated_at?: string
        }
        Update: {
          celular?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          pix?: string | null
          razao_social?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo_pessoa_doc?: Database["public"]["Enums"]["tipo_pessoa_doc"]
          tipo_servico_fornecido?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      incidentes_seguranca: {
        Row: {
          created_at: string
          dados_afetados: string | null
          descricao: string
          detectado_em: string
          id: string
          notificado_anpd_em: string | null
          notificado_titulares_em: string | null
          pessoas_afetadas_qtd: number | null
          status: string
        }
        Insert: {
          created_at?: string
          dados_afetados?: string | null
          descricao: string
          detectado_em?: string
          id?: string
          notificado_anpd_em?: string | null
          notificado_titulares_em?: string | null
          pessoas_afetadas_qtd?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          dados_afetados?: string | null
          descricao?: string
          detectado_em?: string
          id?: string
          notificado_anpd_em?: string | null
          notificado_titulares_em?: string | null
          pessoas_afetadas_qtd?: number | null
          status?: string
        }
        Relationships: []
      }
      limites_peso_pbtc_eixos: {
        Row: {
          confiabilidade: string
          eixos: number
          limite_kg: number
          observacao: string | null
          tipo_peso: string
          tipo_veiculo_referencia: string | null
          updated_at: string
        }
        Insert: {
          confiabilidade?: string
          eixos: number
          limite_kg: number
          observacao?: string | null
          tipo_peso?: string
          tipo_veiculo_referencia?: string | null
          updated_at?: string
        }
        Update: {
          confiabilidade?: string
          eixos?: number
          limite_kg?: number
          observacao?: string | null
          tipo_peso?: string
          tipo_veiculo_referencia?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      municipios_ibge: {
        Row: {
          aliquota_iss_transporte: number | null
          cidade: string
          codigo_ibge: string
          created_at: string
          eh_sede_rbr: boolean
          uf: string
        }
        Insert: {
          aliquota_iss_transporte?: number | null
          cidade: string
          codigo_ibge: string
          created_at?: string
          eh_sede_rbr?: boolean
          uf: string
        }
        Update: {
          aliquota_iss_transporte?: number | null
          cidade?: string
          codigo_ibge?: string
          created_at?: string
          eh_sede_rbr?: boolean
          uf?: string
        }
        Relationships: []
      }
      nfse_comissao: {
        Row: {
          competencia: string | null
          created_at: string
          id: string
          numero_nfse: string | null
          provedor: string | null
          referencia_id: string | null
          status: string
          valor: number | null
        }
        Insert: {
          competencia?: string | null
          created_at?: string
          id?: string
          numero_nfse?: string | null
          provedor?: string | null
          referencia_id?: string | null
          status?: string
          valor?: number | null
        }
        Update: {
          competencia?: string | null
          created_at?: string
          id?: string
          numero_nfse?: string | null
          provedor?: string | null
          referencia_id?: string | null
          status?: string
          valor?: number | null
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          canal: Database["public"]["Enums"]["canal_notificacao"]
          conteudo: string | null
          criado_em: string
          entregue_em: string | null
          id: string
          pessoa_id: string
          referencia_id: string | null
          status_entrega: Database["public"]["Enums"]["status_entrega_notificacao"]
          tentativas: number
          tipo: string
        }
        Insert: {
          canal: Database["public"]["Enums"]["canal_notificacao"]
          conteudo?: string | null
          criado_em?: string
          entregue_em?: string | null
          id?: string
          pessoa_id: string
          referencia_id?: string | null
          status_entrega?: Database["public"]["Enums"]["status_entrega_notificacao"]
          tentativas?: number
          tipo: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_notificacao"]
          conteudo?: string | null
          criado_em?: string
          entregue_em?: string | null
          id?: string
          pessoa_id?: string
          referencia_id?: string | null
          status_entrega?: Database["public"]["Enums"]["status_entrega_notificacao"]
          tentativas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "notificacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      operacao_checklist_fotos: {
        Row: {
          created_at: string
          etapa: Database["public"]["Enums"]["etapa_checklist"]
          foto_url: string
          id: string
          legivel: boolean | null
          operacao_id: string
          validado_por_ia: boolean
        }
        Insert: {
          created_at?: string
          etapa: Database["public"]["Enums"]["etapa_checklist"]
          foto_url: string
          id?: string
          legivel?: boolean | null
          operacao_id: string
          validado_por_ia?: boolean
        }
        Update: {
          created_at?: string
          etapa?: Database["public"]["Enums"]["etapa_checklist"]
          foto_url?: string
          id?: string
          legivel?: boolean | null
          operacao_id?: string
          validado_por_ia?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "operacao_checklist_fotos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_checklist_fotos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      operacao_manual_relatorios_cliente: {
        Row: {
          arquivo_url: string | null
          enviado_em: string
          enviado_para_email: string | null
          id: string
          motorista_id: string
          operacao_id: string
        }
        Insert: {
          arquivo_url?: string | null
          enviado_em?: string
          enviado_para_email?: string | null
          id?: string
          motorista_id: string
          operacao_id: string
        }
        Update: {
          arquivo_url?: string | null
          enviado_em?: string
          enviado_para_email?: string | null
          id?: string
          motorista_id?: string
          operacao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operacao_manual_relatorios_cliente_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_manual_relatorios_cliente_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "operacao_manual_relatorios_cliente_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "operacao_manual_relatorios_cliente_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacao_manual_relatorios_cliente_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      operacoes: {
        Row: {
          agenciador_id: string | null
          altura_cm: number | null
          bloqueio_fiscal: boolean
          bloqueio_fiscal_motivo: string | null
          carga_complexa: boolean | null
          carga_complexa_eixo1_perigosa: boolean
          carga_complexa_eixo2_superdimensionada: boolean
          carga_complexa_eixo3_seguro_excedido: boolean
          carga_complexa_eixo4_pontuacao_insuficiente: boolean
          checkbox_indivisivel_manual: boolean
          cliente_id: string | null
          comprimento_cm: number | null
          confirmado_em: string | null
          confirmado_por: string | null
          cotacao_id: string | null
          created_at: string
          deleted_at: string | null
          finalizada_em: string | null
          id: string
          largura_cm: number | null
          ncm: string | null
          numero_onu: string | null
          origem: Database["public"]["Enums"]["origem_operacao"]
          pagamento_pos_entrega_confirmado: boolean
          pagamento_pos_entrega_confirmado_em: string | null
          pagamento_pos_entrega_confirmado_por: string | null
          peso_bruto: number | null
          pessoa_alocada_id: string | null
          pix_adiantamento_expira_em: string | null
          projeto_id: string | null
          status: Database["public"]["Enums"]["status_operacao"]
          updated_at: string
          valor_declarado_nfe: number | null
          veiculo_id: string | null
        }
        Insert: {
          agenciador_id?: string | null
          altura_cm?: number | null
          bloqueio_fiscal?: boolean
          bloqueio_fiscal_motivo?: string | null
          carga_complexa?: boolean | null
          carga_complexa_eixo1_perigosa?: boolean
          carga_complexa_eixo2_superdimensionada?: boolean
          carga_complexa_eixo3_seguro_excedido?: boolean
          carga_complexa_eixo4_pontuacao_insuficiente?: boolean
          checkbox_indivisivel_manual?: boolean
          cliente_id?: string | null
          comprimento_cm?: number | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          cotacao_id?: string | null
          created_at?: string
          deleted_at?: string | null
          finalizada_em?: string | null
          id?: string
          largura_cm?: number | null
          ncm?: string | null
          numero_onu?: string | null
          origem?: Database["public"]["Enums"]["origem_operacao"]
          pagamento_pos_entrega_confirmado?: boolean
          pagamento_pos_entrega_confirmado_em?: string | null
          pagamento_pos_entrega_confirmado_por?: string | null
          peso_bruto?: number | null
          pessoa_alocada_id?: string | null
          pix_adiantamento_expira_em?: string | null
          projeto_id?: string | null
          status?: Database["public"]["Enums"]["status_operacao"]
          updated_at?: string
          valor_declarado_nfe?: number | null
          veiculo_id?: string | null
        }
        Update: {
          agenciador_id?: string | null
          altura_cm?: number | null
          bloqueio_fiscal?: boolean
          bloqueio_fiscal_motivo?: string | null
          carga_complexa?: boolean | null
          carga_complexa_eixo1_perigosa?: boolean
          carga_complexa_eixo2_superdimensionada?: boolean
          carga_complexa_eixo3_seguro_excedido?: boolean
          carga_complexa_eixo4_pontuacao_insuficiente?: boolean
          checkbox_indivisivel_manual?: boolean
          cliente_id?: string | null
          comprimento_cm?: number | null
          confirmado_em?: string | null
          confirmado_por?: string | null
          cotacao_id?: string | null
          created_at?: string
          deleted_at?: string | null
          finalizada_em?: string | null
          id?: string
          largura_cm?: number | null
          ncm?: string | null
          numero_onu?: string | null
          origem?: Database["public"]["Enums"]["origem_operacao"]
          pagamento_pos_entrega_confirmado?: boolean
          pagamento_pos_entrega_confirmado_em?: string | null
          pagamento_pos_entrega_confirmado_por?: string | null
          peso_bruto?: number | null
          pessoa_alocada_id?: string | null
          pix_adiantamento_expira_em?: string | null
          projeto_id?: string | null
          status?: Database["public"]["Enums"]["status_operacao"]
          updated_at?: string
          valor_declarado_nfe?: number | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operacoes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "operacoes_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "operacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "operacoes_confirmado_por_fkey"
            columns: ["confirmado_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "operacoes_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: true
            referencedRelation: "cotacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_cotacao_id_fkey"
            columns: ["cotacao_id"]
            isOneToOne: true
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["cotacao_id"]
          },
          {
            foreignKeyName: "operacoes_pagamento_pos_entrega_confirmado_por_fkey"
            columns: ["pagamento_pos_entrega_confirmado_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_pagamento_pos_entrega_confirmado_por_fkey"
            columns: ["pagamento_pos_entrega_confirmado_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "operacoes_pagamento_pos_entrega_confirmado_por_fkey"
            columns: ["pagamento_pos_entrega_confirmado_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "operacoes_pessoa_alocada_id_fkey"
            columns: ["pessoa_alocada_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_pessoa_alocada_id_fkey"
            columns: ["pessoa_alocada_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "operacoes_pessoa_alocada_id_fkey"
            columns: ["pessoa_alocada_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "operacoes_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operacoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "operacoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      pagamentos_motorista: {
        Row: {
          chave_idempotencia: string
          confirmado_manualmente_em: string | null
          confirmado_manualmente_por: string | null
          created_at: string
          data_pagamento: string | null
          data_prevista: string | null
          id: string
          motorista_id: string
          operacao_id: string
          origem_carga: Database["public"]["Enums"]["origem_operacao"]
          percentual_config: number | null
          status: Database["public"]["Enums"]["status_pagamento_motorista"]
          tipo: Database["public"]["Enums"]["tipo_pagamento_motorista"]
          updated_at: string
          valor: number
          veiculo_id: string
        }
        Insert: {
          chave_idempotencia: string
          confirmado_manualmente_em?: string | null
          confirmado_manualmente_por?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_prevista?: string | null
          id?: string
          motorista_id: string
          operacao_id: string
          origem_carga: Database["public"]["Enums"]["origem_operacao"]
          percentual_config?: number | null
          status?: Database["public"]["Enums"]["status_pagamento_motorista"]
          tipo: Database["public"]["Enums"]["tipo_pagamento_motorista"]
          updated_at?: string
          valor: number
          veiculo_id: string
        }
        Update: {
          chave_idempotencia?: string
          confirmado_manualmente_em?: string | null
          confirmado_manualmente_por?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_prevista?: string | null
          id?: string
          motorista_id?: string
          operacao_id?: string
          origem_carga?: Database["public"]["Enums"]["origem_operacao"]
          percentual_config?: number | null
          status?: Database["public"]["Enums"]["status_pagamento_motorista"]
          tipo?: Database["public"]["Enums"]["tipo_pagamento_motorista"]
          updated_at?: string
          valor?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_motorista_confirmado_manualmente_por_fkey"
            columns: ["confirmado_manualmente_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_confirmado_manualmente_por_fkey"
            columns: ["confirmado_manualmente_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_confirmado_manualmente_por_fkey"
            columns: ["confirmado_manualmente_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "pagamentos_motorista_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_fiscais: {
        Row: {
          ambiente: string
          ativo: boolean
          cnpj: string
          created_at: string
          icms_aliquota_intraestadual_sp: number | null
          id: string
          inscricao_estadual: string | null
          item_lista_servico_transporte_municipal: string | null
          nfse_nacional_habilitada: boolean
          provedor: string
          razao_social: string
          token_homologacao_vault_secret_id: string | null
          token_producao_vault_secret_id: string | null
          updated_at: string
          webmania_conta_identificador: string | null
          webmania_token_vault_secret_id: string | null
        }
        Insert: {
          ambiente?: string
          ativo?: boolean
          cnpj: string
          created_at?: string
          icms_aliquota_intraestadual_sp?: number | null
          id?: string
          inscricao_estadual?: string | null
          item_lista_servico_transporte_municipal?: string | null
          nfse_nacional_habilitada?: boolean
          provedor?: string
          razao_social: string
          token_homologacao_vault_secret_id?: string | null
          token_producao_vault_secret_id?: string | null
          updated_at?: string
          webmania_conta_identificador?: string | null
          webmania_token_vault_secret_id?: string | null
        }
        Update: {
          ambiente?: string
          ativo?: boolean
          cnpj?: string
          created_at?: string
          icms_aliquota_intraestadual_sp?: number | null
          id?: string
          inscricao_estadual?: string | null
          item_lista_servico_transporte_municipal?: string | null
          nfse_nacional_habilitada?: boolean
          provedor?: string
          razao_social?: string
          token_homologacao_vault_secret_id?: string | null
          token_producao_vault_secret_id?: string | null
          updated_at?: string
          webmania_conta_identificador?: string | null
          webmania_token_vault_secret_id?: string | null
        }
        Relationships: []
      }
      parametros_sistema: {
        Row: {
          chave: string
          descricao: string | null
          updated_at: string
          valor: Json
        }
        Insert: {
          chave: string
          descricao?: string | null
          updated_at?: string
          valor: Json
        }
        Update: {
          chave?: string
          descricao?: string | null
          updated_at?: string
          valor?: Json
        }
        Relationships: []
      }
      parcelas_pagamento_motorista: {
        Row: {
          condicao_pagamento_id: string
          data_vencimento: string
          id: string
          numero_parcela: number
          status: Database["public"]["Enums"]["status_parcela"]
          valor: number
        }
        Insert: {
          condicao_pagamento_id: string
          data_vencimento: string
          id?: string
          numero_parcela: number
          status?: Database["public"]["Enums"]["status_parcela"]
          valor: number
        }
        Update: {
          condicao_pagamento_id?: string
          data_vencimento?: string
          id?: string
          numero_parcela?: number
          status?: Database["public"]["Enums"]["status_parcela"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "parcelas_pagamento_motorista_condicao_pagamento_id_fkey"
            columns: ["condicao_pagamento_id"]
            isOneToOne: false
            referencedRelation: "condicoes_pagamento_operacao"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          auth_user_id: string | null
          bairro: string | null
          celular: string | null
          cep: string | null
          cidade: string | null
          cnh_categoria: string | null
          cnh_extraido_por_ia: boolean
          cnh_foto_url: string | null
          cnh_numero_registro: string | null
          cnh_preenchido_manualmente: boolean
          cnh_validade: string | null
          cnpj: string | null
          complemento: string | null
          cpf: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          logradouro: string | null
          nome: string
          numero_endereco: string | null
          origem_cadastro: string | null
          papel: Database["public"]["Enums"]["papel_pessoa"]
          pix: string | null
          retention_until: string | null
          rntrc_numero: string | null
          rntrc_status: string | null
          rntrc_validade: string | null
          status: Database["public"]["Enums"]["status_ciclo_vida"]
          status_online: boolean
          status_online_atualizado_em: string | null
          tipo_pessoa_doc: Database["public"]["Enums"]["tipo_pessoa_doc"]
          titular_id: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cnh_categoria?: string | null
          cnh_extraido_por_ia?: boolean
          cnh_foto_url?: string | null
          cnh_numero_registro?: string | null
          cnh_preenchido_manualmente?: boolean
          cnh_validade?: string | null
          cnpj?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero_endereco?: string | null
          origem_cadastro?: string | null
          papel: Database["public"]["Enums"]["papel_pessoa"]
          pix?: string | null
          retention_until?: string | null
          rntrc_numero?: string | null
          rntrc_status?: string | null
          rntrc_validade?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          status_online?: boolean
          status_online_atualizado_em?: string | null
          tipo_pessoa_doc?: Database["public"]["Enums"]["tipo_pessoa_doc"]
          titular_id?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          bairro?: string | null
          celular?: string | null
          cep?: string | null
          cidade?: string | null
          cnh_categoria?: string | null
          cnh_extraido_por_ia?: boolean
          cnh_foto_url?: string | null
          cnh_numero_registro?: string | null
          cnh_preenchido_manualmente?: boolean
          cnh_validade?: string | null
          cnpj?: string | null
          complemento?: string | null
          cpf?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero_endereco?: string | null
          origem_cadastro?: string | null
          papel?: Database["public"]["Enums"]["papel_pessoa"]
          pix?: string | null
          retention_until?: string | null
          rntrc_numero?: string | null
          rntrc_status?: string | null
          rntrc_validade?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          status_online?: boolean
          status_online_atualizado_em?: string | null
          tipo_pessoa_doc?: Database["public"]["Enums"]["tipo_pessoa_doc"]
          titular_id?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pessoas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      piso_antt_coeficientes: {
        Row: {
          cc_fixo: number
          ccd_por_km: number
          criado_em: string
          data_vigencia: string
          eixos: number
          fonte: string
          id: string
          tabela: string
          tabela_descricao: string
          tipo_carga: string
        }
        Insert: {
          cc_fixo: number
          ccd_por_km: number
          criado_em?: string
          data_vigencia: string
          eixos: number
          fonte: string
          id?: string
          tabela: string
          tabela_descricao: string
          tipo_carga: string
        }
        Update: {
          cc_fixo?: number
          ccd_por_km?: number
          criado_em?: string
          data_vigencia?: string
          eixos?: number
          fonte?: string
          id?: string
          tabela?: string
          tabela_descricao?: string
          tipo_carga?: string
        }
        Relationships: []
      }
      pix_cobrancas_agenciador: {
        Row: {
          agenciador_id: string
          chave_pix: string | null
          confirmado_em: string | null
          created_at: string
          id: string
          janela_expira_em: string | null
          operacao_id: string
          qrcode: string | null
          status: Database["public"]["Enums"]["status_pix_agenciador"]
          valor: number
          webhook_payload: Json | null
        }
        Insert: {
          agenciador_id: string
          chave_pix?: string | null
          confirmado_em?: string | null
          created_at?: string
          id?: string
          janela_expira_em?: string | null
          operacao_id: string
          qrcode?: string | null
          status?: Database["public"]["Enums"]["status_pix_agenciador"]
          valor: number
          webhook_payload?: Json | null
        }
        Update: {
          agenciador_id?: string
          chave_pix?: string | null
          confirmado_em?: string | null
          created_at?: string
          id?: string
          janela_expira_em?: string | null
          operacao_id?: string
          qrcode?: string | null
          status?: Database["public"]["Enums"]["status_pix_agenciador"]
          valor?: number
          webhook_payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pix_cobrancas_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_cobrancas_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pix_cobrancas_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "pix_cobrancas_agenciador_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_cobrancas_agenciador_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      pontuacao_contestacoes: {
        Row: {
          anexo_url: string | null
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          id: string
          motivo_decisao: string | null
          pessoa_id: string
          pontuacao_evento_id: string
          sla_limite: string | null
          status: Database["public"]["Enums"]["status_contestacao"]
          texto_contestacao: string
        }
        Insert: {
          anexo_url?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          motivo_decisao?: string | null
          pessoa_id: string
          pontuacao_evento_id: string
          sla_limite?: string | null
          status?: Database["public"]["Enums"]["status_contestacao"]
          texto_contestacao: string
        }
        Update: {
          anexo_url?: string | null
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          id?: string
          motivo_decisao?: string | null
          pessoa_id?: string
          pontuacao_evento_id?: string
          sla_limite?: string | null
          status?: Database["public"]["Enums"]["status_contestacao"]
          texto_contestacao?: string
        }
        Relationships: [
          {
            foreignKeyName: "pontuacao_contestacoes_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pontuacao_contestacoes_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pontuacao_contestacoes_decidido_por_fkey"
            columns: ["decidido_por"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "pontuacao_contestacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pontuacao_contestacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pontuacao_contestacoes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "pontuacao_contestacoes_pontuacao_evento_id_fkey"
            columns: ["pontuacao_evento_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      pontuacao_eventos: {
        Row: {
          aplicado_em: string
          created_at: string
          dado_origem: Json | null
          id: string
          motivo_texto: string | null
          operacao_id: string | null
          pessoa_id: string
          pontos: number
          regra_aplicada: string | null
          revertido_por_contestacao_id: string | null
          sinal: Database["public"]["Enums"]["sinal_pontuacao"]
          tipo_criterio: string
        }
        Insert: {
          aplicado_em?: string
          created_at?: string
          dado_origem?: Json | null
          id?: string
          motivo_texto?: string | null
          operacao_id?: string | null
          pessoa_id: string
          pontos: number
          regra_aplicada?: string | null
          revertido_por_contestacao_id?: string | null
          sinal: Database["public"]["Enums"]["sinal_pontuacao"]
          tipo_criterio: string
        }
        Update: {
          aplicado_em?: string
          created_at?: string
          dado_origem?: Json | null
          id?: string
          motivo_texto?: string | null
          operacao_id?: string | null
          pessoa_id?: string
          pontos?: number
          regra_aplicada?: string | null
          revertido_por_contestacao_id?: string | null
          sinal?: Database["public"]["Enums"]["sinal_pontuacao"]
          tipo_criterio?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pontuacao_reversao"
            columns: ["revertido_por_contestacao_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_contestacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pontuacao_eventos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pontuacao_eventos_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
          {
            foreignKeyName: "pontuacao_eventos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pontuacao_eventos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pontuacao_eventos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      posicoes_gps: {
        Row: {
          capturado_em: string
          created_at: string
          fonte: Database["public"]["Enums"]["fonte_gps"]
          id: number
          latitude: number
          longitude: number
          operacao_id: string | null
          pessoa_id: string
          retention_until: string | null
          veiculo_id: string | null
        }
        Insert: {
          capturado_em: string
          created_at?: string
          fonte: Database["public"]["Enums"]["fonte_gps"]
          id?: never
          latitude: number
          longitude: number
          operacao_id?: string | null
          pessoa_id: string
          retention_until?: string | null
          veiculo_id?: string | null
        }
        Update: {
          capturado_em?: string
          created_at?: string
          fonte?: Database["public"]["Enums"]["fonte_gps"]
          id?: never
          latitude?: number
          longitude?: number
          operacao_id?: string | null
          pessoa_id?: string
          retention_until?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posicoes_gps_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_gps_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
          {
            foreignKeyName: "posicoes_gps_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_gps_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "posicoes_gps_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "posicoes_gps_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "posicoes_gps_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      prestadores_parceiros: {
        Row: {
          celular: string | null
          cnh_ou_cnpj_validado: boolean
          cnpj: string | null
          condicoes_comerciais: string | null
          created_at: string
          email: string | null
          id: string
          pessoa_id: string | null
          rntrc_status: string | null
          status: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo_pessoa_doc: Database["public"]["Enums"]["tipo_pessoa_doc"]
          updated_at: string
        }
        Insert: {
          celular?: string | null
          cnh_ou_cnpj_validado?: boolean
          cnpj?: string | null
          condicoes_comerciais?: string | null
          created_at?: string
          email?: string | null
          id?: string
          pessoa_id?: string | null
          rntrc_status?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo_pessoa_doc?: Database["public"]["Enums"]["tipo_pessoa_doc"]
          updated_at?: string
        }
        Update: {
          celular?: string | null
          cnh_ou_cnpj_validado?: boolean
          cnpj?: string | null
          condicoes_comerciais?: string | null
          created_at?: string
          email?: string | null
          id?: string
          pessoa_id?: string | null
          rntrc_status?: string | null
          status?: Database["public"]["Enums"]["status_ciclo_vida"]
          tipo_pessoa_doc?: Database["public"]["Enums"]["tipo_pessoa_doc"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prestadores_parceiros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prestadores_parceiros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "prestadores_parceiros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      projetos: {
        Row: {
          agenciador_id: string | null
          cidade_destino: string | null
          cidade_origem: string | null
          cliente_id: string | null
          created_at: string
          data_fim_prevista: string | null
          data_inicio: string | null
          id: string
          nome: string
          observacoes: string | null
          quantidade_cargas_planejada: number | null
          status: string
          uf_destino: string | null
          uf_origem: string | null
          updated_at: string
        }
        Insert: {
          agenciador_id?: string | null
          cidade_destino?: string | null
          cidade_origem?: string | null
          cliente_id?: string | null
          created_at?: string
          data_fim_prevista?: string | null
          data_inicio?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          quantidade_cargas_planejada?: number | null
          status?: string
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
        }
        Update: {
          agenciador_id?: string | null
          cidade_destino?: string | null
          cidade_origem?: string | null
          cliente_id?: string | null
          created_at?: string
          data_fim_prevista?: string | null
          data_inicio?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          quantidade_cargas_planejada?: number | null
          status?: string
          uf_destino?: string | null
          uf_origem?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "projetos_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "projetos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_regulatorio_execucoes: {
        Row: {
          created_at: string
          encontrou_atualizacao: boolean
          executado_em: string
          fontes_consultadas: string[]
          id: string
          numero_critico_alterado: boolean
          resumo: string
          tema_id: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          encontrou_atualizacao?: boolean
          executado_em?: string
          fontes_consultadas?: string[]
          id?: string
          numero_critico_alterado?: boolean
          resumo: string
          tema_id?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          encontrou_atualizacao?: boolean
          executado_em?: string
          fontes_consultadas?: string[]
          id?: string
          numero_critico_alterado?: boolean
          resumo?: string
          tema_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "radar_regulatorio_execucoes_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "radar_regulatorio_temas"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_regulatorio_temas: {
        Row: {
          ativo: boolean
          categoria_base_conhecimento: string
          chave: string
          created_at: string
          descricao: string
          fontes_oficiais: string[]
          frequencia_dias: number
          id: string
          prioridade: number
          proxima_verificacao_em: string
          status: Database["public"]["Enums"]["status_radar_tema"]
          titulo: string
          ultima_verificacao_em: string | null
          ultimo_resumo: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria_base_conhecimento: string
          chave: string
          created_at?: string
          descricao: string
          fontes_oficiais?: string[]
          frequencia_dias?: number
          id?: string
          prioridade?: number
          proxima_verificacao_em?: string
          status?: Database["public"]["Enums"]["status_radar_tema"]
          titulo: string
          ultima_verificacao_em?: string | null
          ultimo_resumo?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria_base_conhecimento?: string
          chave?: string
          created_at?: string
          descricao?: string
          fontes_oficiais?: string[]
          frequencia_dias?: number
          id?: string
          prioridade?: number
          proxima_verificacao_em?: string
          status?: Database["public"]["Enums"]["status_radar_tema"]
          titulo?: string
          ultima_verificacao_em?: string | null
          ultimo_resumo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      regua_cobranca_eventos: {
        Row: {
          canal: string
          enviado_em: string
          fatura_id: string
          id: string
          tipo: string
        }
        Insert: {
          canal: string
          enviado_em?: string
          fatura_id: string
          id?: string
          tipo: string
        }
        Update: {
          canal?: string
          enviado_em?: string
          fatura_id?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "regua_cobranca_eventos_fatura_id_fkey"
            columns: ["fatura_id"]
            isOneToOne: false
            referencedRelation: "faturas"
            referencedColumns: ["id"]
          },
        ]
      }
      rntrc_consultas: {
        Row: {
          categoria: string | null
          data_ultima_consulta: string
          entidade_tipo: string
          id: string
          pessoa_id: string | null
          rntrc_numero: string | null
          situacao: string | null
          validade: string | null
          veiculo_id: string | null
        }
        Insert: {
          categoria?: string | null
          data_ultima_consulta?: string
          entidade_tipo: string
          id?: string
          pessoa_id?: string | null
          rntrc_numero?: string | null
          situacao?: string | null
          validade?: string | null
          veiculo_id?: string | null
        }
        Update: {
          categoria?: string | null
          data_ultima_consulta?: string
          entidade_tipo?: string
          id?: string
          pessoa_id?: string | null
          rntrc_numero?: string | null
          situacao?: string | null
          validade?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rntrc_consultas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rntrc_consultas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "rntrc_consultas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "rntrc_consultas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "rntrc_consultas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      saldos_projetados_caixa: {
        Row: {
          alerta_disparado: boolean
          created_at: string
          data: string
          entradas_previstas: number
          id: string
          saidas_previstas: number
          saldo_projetado: number
        }
        Insert: {
          alerta_disparado?: boolean
          created_at?: string
          data: string
          entradas_previstas?: number
          id?: string
          saidas_previstas?: number
          saldo_projetado: number
        }
        Update: {
          alerta_disparado?: boolean
          created_at?: string
          data?: string
          entradas_previstas?: number
          id?: string
          saidas_previstas?: number
          saldo_projetado?: number
        }
        Relationships: []
      }
      solicitacoes_exclusao_dados: {
        Row: {
          created_at: string
          grupo_a_retido: Json | null
          grupo_b_excluido: Json | null
          id: string
          identidade_confirmada: boolean
          pessoa_id: string
          resposta_enviada_em: string | null
          solicitado_em: string
          status: Database["public"]["Enums"]["status_exclusao_lgpd"]
        }
        Insert: {
          created_at?: string
          grupo_a_retido?: Json | null
          grupo_b_excluido?: Json | null
          id?: string
          identidade_confirmada?: boolean
          pessoa_id: string
          resposta_enviada_em?: string | null
          solicitado_em?: string
          status?: Database["public"]["Enums"]["status_exclusao_lgpd"]
        }
        Update: {
          created_at?: string
          grupo_a_retido?: Json | null
          grupo_b_excluido?: Json | null
          id?: string
          identidade_confirmada?: boolean
          pessoa_id?: string
          resposta_enviada_em?: string | null
          solicitado_em?: string
          status?: Database["public"]["Enums"]["status_exclusao_lgpd"]
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_exclusao_dados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_exclusao_dados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "solicitacoes_exclusao_dados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      spreads_agenciador: {
        Row: {
          agenciador_id: string
          created_at: string
          id: string
          operacao_id: string
          valor_bruto: number
          valor_liquido: number | null
          valor_taxa_tecnologia: number
        }
        Insert: {
          agenciador_id: string
          created_at?: string
          id?: string
          operacao_id: string
          valor_bruto: number
          valor_liquido?: number | null
          valor_taxa_tecnologia: number
        }
        Update: {
          agenciador_id?: string
          created_at?: string
          id?: string
          operacao_id?: string
          valor_bruto?: number
          valor_liquido?: number | null
          valor_taxa_tecnologia?: number
        }
        Relationships: [
          {
            foreignKeyName: "spreads_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spreads_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "spreads_agenciador_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "spreads_agenciador_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spreads_agenciador_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      taxas_tecnologia: {
        Row: {
          agenciador_id: string
          created_at: string
          descontada_do_spread: boolean
          id: string
          operacao_id: string
          valor: number
        }
        Insert: {
          agenciador_id: string
          created_at?: string
          descontada_do_spread?: boolean
          id?: string
          operacao_id: string
          valor?: number
        }
        Update: {
          agenciador_id?: string
          created_at?: string
          descontada_do_spread?: boolean
          id?: string
          operacao_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "taxas_tecnologia_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxas_tecnologia_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "taxas_tecnologia_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "taxas_tecnologia_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "operacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "taxas_tecnologia_operacao_id_fkey"
            columns: ["operacao_id"]
            isOneToOne: true
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["operacao_id"]
          },
        ]
      }
      validacoes_titularidade_pix: {
        Row: {
          chave_pix: string
          cpf_cnpj_cadastrado: string | null
          cpf_cnpj_retornado_dict: string | null
          created_at: string
          destinatario_id: string
          id: string
          tipo_destinatario: string
          validado: boolean
          validado_em: string | null
        }
        Insert: {
          chave_pix: string
          cpf_cnpj_cadastrado?: string | null
          cpf_cnpj_retornado_dict?: string | null
          created_at?: string
          destinatario_id: string
          id?: string
          tipo_destinatario: string
          validado?: boolean
          validado_em?: string | null
        }
        Update: {
          chave_pix?: string
          cpf_cnpj_cadastrado?: string | null
          cpf_cnpj_retornado_dict?: string | null
          created_at?: string
          destinatario_id?: string
          id?: string
          tipo_destinatario?: string
          validado?: boolean
          validado_em?: string | null
        }
        Relationships: []
      }
      veiculos: {
        Row: {
          ano: number | null
          ativo: boolean
          capacidade_carga: number | null
          chassi: string | null
          created_at: string
          crlv_extraido_por_ia: boolean
          crlv_foto_url: string | null
          crlv_preenchido_manualmente: boolean
          deleted_at: string | null
          id: string
          is_veiculo_proprio: boolean
          marca_modelo: string | null
          placa: string
          potencia_cv: number | null
          quantidade_eixos: number | null
          quantidade_pneus: number | null
          renavam: string
          rntrc_numero: string | null
          rntrc_status: string | null
          rntrc_validade: string | null
          tara_kg: number | null
          tipo_veiculo: string | null
          titular_id: string
          updated_at: string
        }
        Insert: {
          ano?: number | null
          ativo?: boolean
          capacidade_carga?: number | null
          chassi?: string | null
          created_at?: string
          crlv_extraido_por_ia?: boolean
          crlv_foto_url?: string | null
          crlv_preenchido_manualmente?: boolean
          deleted_at?: string | null
          id?: string
          is_veiculo_proprio?: boolean
          marca_modelo?: string | null
          placa: string
          potencia_cv?: number | null
          quantidade_eixos?: number | null
          quantidade_pneus?: number | null
          renavam: string
          rntrc_numero?: string | null
          rntrc_status?: string | null
          rntrc_validade?: string | null
          tara_kg?: number | null
          tipo_veiculo?: string | null
          titular_id: string
          updated_at?: string
        }
        Update: {
          ano?: number | null
          ativo?: boolean
          capacidade_carga?: number | null
          chassi?: string | null
          created_at?: string
          crlv_extraido_por_ia?: boolean
          crlv_foto_url?: string | null
          crlv_preenchido_manualmente?: boolean
          deleted_at?: string | null
          id?: string
          is_veiculo_proprio?: boolean
          marca_modelo?: string | null
          placa?: string
          potencia_cv?: number | null
          quantidade_eixos?: number | null
          quantidade_pneus?: number | null
          renavam?: string
          rntrc_numero?: string | null
          rntrc_status?: string | null
          rntrc_validade?: string | null
          tara_kg?: number | null
          tipo_veiculo?: string | null
          titular_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "veiculos_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      vinculos_agenciador_motorista: {
        Row: {
          agenciador_id: string
          created_at: string
          id: string
          motorista_id: string
          resolvido_em: string | null
          status: Database["public"]["Enums"]["status_vinculo_agenciador"]
        }
        Insert: {
          agenciador_id: string
          created_at?: string
          id?: string
          motorista_id: string
          resolvido_em?: string | null
          status?: Database["public"]["Enums"]["status_vinculo_agenciador"]
        }
        Update: {
          agenciador_id?: string
          created_at?: string
          id?: string
          motorista_id?: string
          resolvido_em?: string | null
          status?: Database["public"]["Enums"]["status_vinculo_agenciador"]
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_agenciador_motorista_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_agenciador_motorista_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_agenciador_motorista_agenciador_id_fkey"
            columns: ["agenciador_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
          {
            foreignKeyName: "vinculos_agenciador_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_agenciador_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "vinculos_agenciador_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
    }
    Views: {
      pontuacao_saldo: {
        Row: {
          papel: Database["public"]["Enums"]["papel_pessoa"] | null
          pessoa_id: string | null
          saldo: number | null
          sem_historico: boolean | null
          titular_id: string | null
          total_eventos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "pontuacao_saldo"
            referencedColumns: ["pessoa_id"]
          },
          {
            foreignKeyName: "pessoas_titular_id_fkey"
            columns: ["titular_id"]
            isOneToOne: false
            referencedRelation: "v_checklist_prontidao"
            referencedColumns: ["motorista_id"]
          },
        ]
      }
      v_checklist_prontidao: {
        Row: {
          ambiente_fiscal: string | null
          apolice_teto: number | null
          averbacao_status:
            | Database["public"]["Enums"]["status_averbacao"]
            | null
          bloqueio_fiscal: boolean | null
          bloqueio_fiscal_motivo: string | null
          carga_complexa: boolean | null
          carga_complexa_eixo1_perigosa: boolean | null
          carga_complexa_eixo2_superdimensionada: boolean | null
          carga_complexa_eixo3_seguro_excedido: boolean | null
          cidade_destino: string | null
          cidade_origem: string | null
          ciot_status:
            | Database["public"]["Enums"]["status_documento_fiscal"]
            | null
          cotacao_id: string | null
          cte_erro: string | null
          cte_numero: string | null
          cte_status:
            | Database["public"]["Enums"]["status_documento_fiscal"]
            | null
          eixos_cotados: number | null
          emitente_cnpj: string | null
          emitente_ie: string | null
          emitente_razao_social: string | null
          excede_teto_seguro: boolean | null
          forma_pagamento_tipo:
            | Database["public"]["Enums"]["tipo_pagamento_prazo"]
            | null
          frete_motorista: number | null
          ie_configurada: boolean | null
          mdfe_erro: string | null
          mdfe_numero: string | null
          mdfe_status:
            | Database["public"]["Enums"]["status_documento_fiscal"]
            | null
          meio_pagamento: Database["public"]["Enums"]["meio_pagamento"] | null
          motorista_cpf: string | null
          motorista_id: string | null
          motorista_nome: string | null
          motorista_rntrc_ativo: boolean | null
          motorista_rntrc_numero: string | null
          natureza_operacao: string | null
          nf_chave_acesso: string | null
          nf_destinatario_cnpj: string | null
          nf_destinatario_razao_social: string | null
          nf_remetente_cnpj: string | null
          nf_remetente_razao_social: string | null
          numero_ciot: string | null
          operacao_id: string | null
          parametros_fiscais_id: string | null
          piso_antt_calculado: number | null
          placa: string | null
          quantidade_eixos: number | null
          rastreio_exigido: boolean | null
          rastreio_status:
            | Database["public"]["Enums"]["status_documento_fiscal"]
            | null
          status_operacao: Database["public"]["Enums"]["status_operacao"] | null
          tipo_carga: string | null
          uf_destino: string | null
          uf_origem: string | null
          valor_adiantamento: number | null
          valor_declarado_nfe: number | null
          valor_nf: number | null
          valor_total_cotacao: number | null
          veiculo_id: string | null
          veiculo_rntrc_ativo: boolean | null
          veiculo_rntrc_numero: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calcular_aliquota_icms_interestadual: {
        Args: { p_uf_destino: string; p_uf_origem: string }
        Returns: number
      }
      current_papel: {
        Args: never
        Returns: Database["public"]["Enums"]["papel_pessoa"]
      }
      current_pessoa_id: { Args: never; Returns: string }
      get_focus_nfe_token: { Args: { p_ambiente: string }; Returns: string }
      get_gemini_api_key: { Args: never; Returns: string }
      peso_acima_limiar_eixo2:
        | { Args: { p_peso_kg: number }; Returns: boolean }
        | { Args: { p_eixos: number; p_peso_kg: number }; Returns: boolean }
      valor_acima_teto_seguro: { Args: { p_valor: number }; Returns: boolean }
    }
    Enums: {
      canal_notificacao: "push" | "whatsapp" | "email" | "sms"
      etapa_checklist:
        | "carregamento"
        | "descarga"
        | "carga_patio"
        | "canhoto"
        | "nota_fiscal_assinada"
      fonte_gps: "app_celular" | "wialon"
      meio_pagamento: "transferencia" | "pix" | "ipef"
      origem_operacao: "rbr_direta" | "agenciador" | "motorista_manual"
      papel_pessoa:
        | "titular_motorista"
        | "condutor"
        | "agenciador"
        | "gestor_rbr"
        | "prestador_parceiro"
      sinal_pontuacao: "positivo" | "negativo"
      status_aet:
        | "nao_solicitada"
        | "protocolada"
        | "emitida"
        | "negada"
        | "vencida"
      status_assinatura:
        | "ativa"
        | "inadimplente"
        | "bloqueada"
        | "cancelada"
        | "encerrado_por_motorista"
        | "suspenso_por_rbr"
        | "aguardando_confirmacao"
      status_averbacao: "em_analise" | "aprovada" | "recusada"
      status_ciclo_vida:
        | "ativo"
        | "inativo"
        | "anonimizado_retencao_fiscal"
        | "excluido"
      status_comissao_agenciador: "pendente" | "creditado"
      status_contestacao:
        | "pendente"
        | "em_analise"
        | "aceita"
        | "negada"
        | "reduzida"
      status_cotacao: "rascunho" | "enviada" | "convertida"
      status_documento_fiscal:
        | "pendente"
        | "emitido"
        | "bloqueado"
        | "erro"
        | "cancelado"
      status_entrega_notificacao:
        | "pendente"
        | "enviado"
        | "falhou"
        | "confirmado_lido"
      status_exclusao_lgpd: "processando" | "concluida"
      status_fatura:
        | "pendente"
        | "aguardando_pagamento"
        | "pago"
        | "vencido"
        | "inadimplente"
        | "cancelada"
      status_operacao:
        | "alocando_motorista"
        | "aguardando_liberacao_fiscal"
        | "liberada_coleta"
        | "carregando"
        | "em_transito"
        | "entregue"
        | "fechada"
        | "cancelada"
      status_pagamento_motorista:
        | "pendente"
        | "aguardando_confirmacao_entrega"
        | "aguardando_pix_agenciador"
        | "pix_confirmado"
        | "documentacao_emitida"
        | "liberado"
        | "pago"
        | "atrasado"
        | "cancelado"
      status_parcela: "pendente" | "paga" | "atrasada"
      status_pix_agenciador: "aguardando" | "confirmado" | "expirado"
      status_radar_tema:
        | "nunca_verificado"
        | "em_dia"
        | "atualizacao_pendente_revisao"
      status_vinculo_agenciador: "reivindicado" | "confirmado" | "rejeitado"
      tipo_documento_fiscal:
        | "cte"
        | "mdfe"
        | "ciot"
        | "atm"
        | "wialon"
        | "apolice_seguro"
        | "nfse"
      tipo_pagamento_motorista: "adiantamento" | "saldo" | "a_vista"
      tipo_pagamento_prazo: "imediato" | "diferido"
      tipo_pessoa_doc: "PF" | "PJ"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      canal_notificacao: ["push", "whatsapp", "email", "sms"],
      etapa_checklist: [
        "carregamento",
        "descarga",
        "carga_patio",
        "canhoto",
        "nota_fiscal_assinada",
      ],
      fonte_gps: ["app_celular", "wialon"],
      meio_pagamento: ["transferencia", "pix", "ipef"],
      origem_operacao: ["rbr_direta", "agenciador", "motorista_manual"],
      papel_pessoa: [
        "titular_motorista",
        "condutor",
        "agenciador",
        "gestor_rbr",
        "prestador_parceiro",
      ],
      sinal_pontuacao: ["positivo", "negativo"],
      status_aet: [
        "nao_solicitada",
        "protocolada",
        "emitida",
        "negada",
        "vencida",
      ],
      status_assinatura: [
        "ativa",
        "inadimplente",
        "bloqueada",
        "cancelada",
        "encerrado_por_motorista",
        "suspenso_por_rbr",
        "aguardando_confirmacao",
      ],
      status_averbacao: ["em_analise", "aprovada", "recusada"],
      status_ciclo_vida: [
        "ativo",
        "inativo",
        "anonimizado_retencao_fiscal",
        "excluido",
      ],
      status_comissao_agenciador: ["pendente", "creditado"],
      status_contestacao: [
        "pendente",
        "em_analise",
        "aceita",
        "negada",
        "reduzida",
      ],
      status_cotacao: ["rascunho", "enviada", "convertida"],
      status_documento_fiscal: [
        "pendente",
        "emitido",
        "bloqueado",
        "erro",
        "cancelado",
      ],
      status_entrega_notificacao: [
        "pendente",
        "enviado",
        "falhou",
        "confirmado_lido",
      ],
      status_exclusao_lgpd: ["processando", "concluida"],
      status_fatura: [
        "pendente",
        "aguardando_pagamento",
        "pago",
        "vencido",
        "inadimplente",
        "cancelada",
      ],
      status_operacao: [
        "alocando_motorista",
        "aguardando_liberacao_fiscal",
        "liberada_coleta",
        "carregando",
        "em_transito",
        "entregue",
        "fechada",
        "cancelada",
      ],
      status_pagamento_motorista: [
        "pendente",
        "aguardando_confirmacao_entrega",
        "aguardando_pix_agenciador",
        "pix_confirmado",
        "documentacao_emitida",
        "liberado",
        "pago",
        "atrasado",
        "cancelado",
      ],
      status_parcela: ["pendente", "paga", "atrasada"],
      status_pix_agenciador: ["aguardando", "confirmado", "expirado"],
      status_radar_tema: [
        "nunca_verificado",
        "em_dia",
        "atualizacao_pendente_revisao",
      ],
      status_vinculo_agenciador: ["reivindicado", "confirmado", "rejeitado"],
      tipo_documento_fiscal: [
        "cte",
        "mdfe",
        "ciot",
        "atm",
        "wialon",
        "apolice_seguro",
        "nfse",
      ],
      tipo_pagamento_motorista: ["adiantamento", "saldo", "a_vista"],
      tipo_pagamento_prazo: ["imediato", "diferido"],
      tipo_pessoa_doc: ["PF", "PJ"],
    },
  },
} as const
