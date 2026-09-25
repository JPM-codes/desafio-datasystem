"# desafio-datasystem" 
Claro. Abaixo está o conteúdo do `.md` consolidado com as regras que definimos até agora:

# Sistema de Fidelidade — FATECalçados

## 1. Visão geral

O sistema de fidelidade da FATECalçados tem como objetivo incentivar a recorrência dos clientes por meio de um programa de pontos, níveis de fidelidade, resgates e benefícios.

O sistema também contará com funcionalidades complementares, como **doações de calçados** e **QR Codes vinculados a produtos para aplicação de descontos**.

---

# 2. Objetivo do projeto

Desenvolver um sistema de fidelidade capaz de:

* Cadastrar e gerenciar clientes;
* Registrar compras;
* Calcular pontos automaticamente;
* Aplicar bônus conforme o nível do cliente;
* Controlar a validade dos pontos;
* Realizar resgates;
* Exibir informações em um dashboard;
* Gerenciar níveis de fidelidade;
* Registrar doações de calçados;
* Criar descontos vinculados a produtos por meio de QR Code;
* Disponibilizar uma API para futuras integrações.

---

# 3. Problema / Dor do cliente

A FATECalçados está perdendo clientes para concorrentes que possuem programas de fidelidade.

O sistema busca oferecer uma solução própria para aumentar a recorrência de compras e criar benefícios para clientes frequentes.

---

# 4. Ambiente de demonstração

Para a apresentação do projeto, serão utilizados dados fictícios.

A demonstração contará com:

* 20 clientes;
* 200 compras;
* Dados fictícios de pontuação;
* Diferentes níveis de fidelidade;
* Resgates;
* Movimentações de pontos;
* Doações;
* Produtos com descontos via QR Code.

Os dados da demonstração serão armazenados em **JSON**, sem necessidade de banco de dados para a primeira versão apresentada.

---

# 5. Dashboard

O dashboard deverá apresentar uma visão geral do sistema.

## Indicadores

* Total de clientes cadastrados;
* Total de pontos acumulados;
* Total de pontos resgatados;
* Valor total dos descontos concedidos;
* Distribuição de clientes por nível;
* Ranking de clientes;
* Evolução da pontuação;
* **Valor potencial dos pontos disponíveis em descontos.**
* **Quantidade de doações realizadas.**

---

# 6. Valor potencial dos pontos

O sistema deverá apresentar quanto os pontos atualmente disponíveis representam em possíveis descontos.

A regra de conversão será:

> **100 pontos = R$ 5,00 de desconto**

Exemplo:

```text
Cliente possui: 2.000 pontos

2.000 ÷ 100 = 20

20 × R$ 5,00 = R$ 100,00
```

Portanto:

> **2.000 pontos disponíveis representam R$ 100,00 em possíveis descontos.**

Esse valor representa um **potencial de desconto**, não um valor que já foi concedido.

---

# 7. Consulta de clientes

O sistema deverá permitir consultar clientes por:

* Nome;
* CPF;
* CNPJ;
* Identificador interno.

Também deverá permitir:

* Ordenação A-Z;
* Ordenação Z-A;
* Maior pontuação;
* Menor pontuação.

---

# 8. Cadastro do cliente

Todo cliente deverá possuir:

* Identificador interno;
* CPF ou CNPJ;
* Tipo de documento;
* Nome;
* Email;
* Pontuação.

**O identificador interno será independente do CPF/CNPJ.**

---

# 9. Sistema de pontuação

A regra básica de pontuação será:

> **A cada R$ 1,00 em compras, o cliente recebe 1 ponto.**

Exemplo:

```text
Compra: R$ 250,00
Pontos base: 250
```

Os pontos serão registrados no histórico de movimentações.

---

# 10. Sistema de bônus

Clientes de níveis superiores recebem pontos adicionais nas compras.

| Nível  |   Pontuação | Bônus |
| ------ | ----------: | ----: |
| Bronze |       0–999 |    0% |
| Prata  | 1.000–4.999 |   10% |
| Ouro   |      5.000+ |   20% |

### Exemplo

Cliente Prata realiza uma compra de R$ 100:

```text
Pontos base: 100
Bônus: 10%
Pontos bônus: 10

Total: 110 pontos
```

Cliente Ouro:

```text
Pontos base: 100
Bônus: 20%
Pontos bônus: 20

Total: 120 pontos
```

**O bônus será calculado de acordo com o nível do cliente no momento da compra.**

**Pontos históricos não serão recalculados caso o cliente mude de nível posteriormente.**

---

# 11. Validade dos pontos

Os pontos terão validade anual.

A data de expiração será fixa:

> **01/01 do ano seguinte ao ano em que os pontos foram adquiridos.**

### Exemplos

| Data da compra | Expiração dos pontos |
| -------------- | -------------------- |
| 15/01/2026     | 01/01/2027           |
| 20/05/2026     | 01/01/2027           |
| 30/11/2026     | 01/01/2027           |
| 05/01/2027     | 01/01/2028           |

Dessa forma, todos os pontos adquiridos durante 2026 terão como data de expiração **01/01/2027**.

---

# 12. Expiração dos pontos

Após atingir a data de expiração:

* Os pontos não poderão mais ser utilizados;
* Os pontos deverão ser removidos do saldo disponível;
* A expiração deverá ser registrada no histórico de movimentações.

Exemplo:

```json
{
  "cliente_id": 1,
  "tipo": "EXPIRACAO",
  "pontos": -500,
  "data_movimentacao": "2027-01-01",
  "data_expiracao": "2027-01-01"
}
```

---

# 13. Resgate de pontos

A conversão será:

> **100 pontos = R$ 5,00 de desconto.**

Exemplo:

```text
500 pontos = R$ 25,00
1.000 pontos = R$ 50,00
2.000 pontos = R$ 100,00
```

O sistema deverá registrar:

* Cliente;
* Quantidade de pontos utilizados;
* Valor do desconto;
* Data do resgate.

---

# 14. Ranking de clientes

O sistema deverá possuir uma área de ranking.

O ranking poderá apresentar os clientes com:

* Maior quantidade de pontos;
* Menor quantidade de pontos.

Também poderá apresentar:

* Nome;
* Nível;
* Pontuação;
* Posição no ranking.

---

# 15. Histórico de movimentações

O sistema deverá manter o histórico das movimentações de pontos.

Tipos de movimentação:

* `ACUMULO`
* `BONUS`
* `RESGATE`
* `EXPIRACAO`
* `AJUSTE`

Cada movimentação deverá possuir:

* Cliente;
* Tipo;
* Quantidade de pontos;
* Data da movimentação;
* Data de expiração, quando aplicável;
* Referência;
* Data de criação.

**O histórico não deverá ser alterado diretamente para modificar o saldo. Novas movimentações deverão ser registradas para representar alterações.**

---

# 16. Sistema de doações de calçados

O sistema contará com uma funcionalidade para registrar doações de calçados realizadas pelos clientes.

O registro será realizado **pelo funcionário da FATECalçados**.

## Fluxo

```text
Cliente entrega o calçado
        ↓
Funcionário acessa o sistema
        ↓
Localiza o cliente
        ↓
Registra a doação
        ↓
Sistema salva o registro
        ↓
Cliente recebe ponto       
```

## Dados da doação

O funcionário poderá registrar:

* Cliente;
* Tipo de calçado;
* Quantidade;
* Estado do calçado;
* Data da doação;
* Observações.

### Exemplo

```json
{
  "id": 15,
  "cliente_id": 1,
  "funcionario_id": 3,
  "tipo": "TENIS",
  "quantidade": 1,
  "estado": "BOM_ESTADO",
  "data_doacao": "2026-09-24",
  "observacao": ""
}
```

# 19. Arquitetura modular

O sistema será estruturado de forma modular, separando as principais responsabilidades.

```text
Sistema FATECalçados
│
├── Clientes
├── Compras
├── Fidelidade
│   ├── Pontos
│   ├── Níveis
│   ├── Resgates
│   └── Expiração
│
├── Dashboard
│
├── QR Code
│   ├── QR Produto
│   └── QR Campanha
│
├── Doações
│
└── API
```

A separação dos módulos permitirá que funcionalidades sejam alteradas ou ampliadas sem afetar diretamente todo o sistema.

---

# 20. Estrutura de dados

Como a primeira demonstração será realizada utilizando JSON, os dados poderão seguir uma estrutura semelhante às tabelas abaixo.

## Clientes

```text
clientes

id
documento
tipo_documento
nome
created_at
updated_at
```

## Compras

```text
compras

id
cliente_id
valor
pontos_base
bonus_percentual
pontos_bonus
pontos_total
data_compra
data_expiracao
created_at
```

## Movimentações de pontos

```text
movimentacoes_pontos

id
cliente_id
tipo
pontos
data_movimentacao
data_expiracao
referencia_id
created_at
```

## Resgates

```text
resgates

id
cliente_id
pontos_utilizados
valor_desconto
data_resgate
created_at
```

## Doações

```text
doacoes

id
cliente_id
funcionario_id
tipo_calçado
quantidade
estado
campanha_id
data_doacao
observacao
created_at
```

## Produtos / QR Codes

```text
produtos

id
nome
preco
created_at
updated_at
```

```text
qr_codes_produtos

id
produto_id
tipo_desconto
valor_desconto
data_inicio
data_validade
ativo
created_at
```

---

# 21. API

O sistema possuirá uma API para permitir futuras integrações com:

* PDV;
* Sistemas de vendas;
* E-commerce;
* Aplicativos;
* Outros sistemas da FATECalçados.

Exemplo:

```http
POST /api/compras
```

```json
{
  "clienteId": 15,
  "valor": 500.00
}
```

O sistema deverá:

1. Identificar o cliente;
2. Verificar seu nível;
3. Calcular os pontos base;
4. Aplicar o bônus;
5. Definir a data de expiração;
6. Registrar a movimentação;
7. Atualizar o saldo.

---

# 22. Stack tecnológica

A primeira versão será desenvolvida utilizando:

* Node.js;
* EJS;
* HTML5;
* CSS3;
* Bootstrap 5;
* JavaScript;
* JSON para a demonstração.

**Posteriormente, os dados poderão ser migrados para um banco de dados como MySQL ou PostgreSQL.**

---

# 23. Funcionalidades principais

## Clientes

* Cadastro;
* Edição;
* Consulta;
* Pesquisa;
* Ordenação.

## Fidelidade

* Acúmulo de pontos;
* Bônus;
* Níveis;
* Expiração;
* Resgate;
* Histórico.

## Dashboard

* Indicadores;
* Ranking;
* Gráficos;
* Distribuição por nível;
* Valor potencial dos pontos.

## Doações

* Registro pelo funcionário;
* Histórico;
* Campanhas;
* Quantidade de calçados doados.


## API

* Clientes;
* Compras;
* Pontos;
* Resgates;
* Futuras integrações.

---

# 24. Possíveis funcionalidades futuras

**As funcionalidades abaixo são sugestões de implementação e não fazem parte obrigatoriamente do escopo inicial.**

* **Login e controle de acesso por funcionário;**
* **Níveis de permissão para funcionários;**
* **Auditoria das alterações realizadas;**
* **Notificação de pontos próximos da expiração;**
* **Notificação quando o cliente atingir um novo nível;**
* **Área do cliente;**
* **Integração com WhatsApp;**
* **Integração com PDV;**
* **Integração com e-commerce;**
* **Relatórios em PDF/Excel;**
* **Campanhas promocionais;**
* **Campanhas de pontos em dobro;**
* **Cupons de desconto;**
* **QR Codes com limite de utilização;**
* **Histórico de utilização dos descontos;**
* **Dashboard específico para campanhas de doação.**

---

# 25. MVP — Primeira versão

Para a primeira apresentação, o sistema deverá priorizar:

### Clientes

* Cadastro;
* Edição;
* Consulta;
* Pesquisa.

### Compras

* Registro de compra;
* Cálculo de pontos;
* Aplicação do bônus.

### Fidelidade

* Níveis;
* Resgates;
* Expiração dos pontos;
* Histórico.

### Dashboard

* Total de clientes;
* Pontos acumulados;
* Pontos resgatados;
* Valor dos resgates;
* Ranking;
* Distribuição dos níveis;
* Valor potencial dos pontos.

### Doações

* Registro realizado pelo funcionário;
* Histórico de doações.

---

# 26. Regras principais do sistema

| Código | Regra                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------ |
| RN001  | Cada R$ 1,00 em compras gera 1 ponto base.                                                       |
| RN002  | Bronze possui 0% de bônus.                                                                       |
| RN003  | Prata possui 10% de bônus.                                                                       |
| RN004  | Ouro possui 20% de bônus.                                                                        |
| RN005  | O bônus é calculado conforme o nível no momento da compra.                                       |
| RN006  | Pontos adquiridos em determinado ano expiram em 01/01 do ano seguinte.                           |
| RN007  | Pontos expirados não podem mais ser utilizados.                                                  |
| RN008  | A expiração deve gerar uma movimentação no histórico.                                            |
| RN009  | 100 pontos equivalem a R$ 5,00 de desconto.                                                      |
| RN010  | O valor potencial representa o desconto que poderia ser obtido utilizando os pontos disponíveis. |
| RN011  | Doações são registradas pelo funcionário.                                                        |
| RN012  | O sistema deverá notificar quando os pontos estiverem 1 mês próximo do vencimento                |

---

# 27. Regra central do sistema

O sistema deverá manter o histórico das operações de forma rastreável.

As alterações de pontuação deverão ocorrer por meio de **movimentações**, evitando alterações diretas que eliminem o histórico da operação.

O sistema deverá permitir visualizar:

```text
Cliente
   ↓
Compras
   ↓
Pontos base
   ↓
Bônus
   ↓
Saldo disponível
   ↓
Resgates / Expirações
   ↓
Saldo atual
```

Dessa forma, o sistema consegue demonstrar de onde vieram os pontos, como foram utilizados e quais pontos ainda estão disponíveis para utilização.
