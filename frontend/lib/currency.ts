type CurrencyValue = {
  contract_value: number | null;
  currency: string | null;
};

export function formatCurrency(value: number | null, currency: string | null) {
  if (value === null) {
    return "—";
  }

  const normalizedCurrency = currency?.trim().toUpperCase();

  if (!normalizedCurrency) {
    return `${value.toLocaleString("en-IN")} (currency unspecified)`;
  }

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${normalizedCurrency} ${value.toLocaleString("en-IN")}`;
  }
}

export function formatContractTotal(contracts: CurrencyValue[]) {
  const totals = new Map<string, number>();
  let unspecifiedTotal = 0;

  for (const contract of contracts) {
    if (contract.contract_value === null) {
      continue;
    }

    const currency = contract.currency?.trim().toUpperCase();

    if (!currency) {
      unspecifiedTotal += contract.contract_value;
      continue;
    }

    totals.set(
      currency,
      (totals.get(currency) ?? 0) + contract.contract_value
    );
  }

  const formattedTotals = [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => formatCurrency(value, currency));

  if (unspecifiedTotal !== 0) {
    formattedTotals.push(formatCurrency(unspecifiedTotal, null));
  }

  return formattedTotals.length > 0 ? formattedTotals.join(" + ") : "—";
}
