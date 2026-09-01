// A realistic invoices dashboard used by every test. Deliberately written with
// plain semantic HTML and ARIA only — no ToolFence-specific hooks — so the tests
// prove the scanner works on ordinary markup.

export const INVOICE_HTML = `
<main>
  <section aria-label="Invoices">
    <h2>Invoices</h2>

    <dl aria-label="Account summary">
      <div><dt>Outstanding</dt><dd>$12,400.00</dd></div>
      <div><dt>Overdue</dt><dd>$4,200.00</dd></div>
      <div><dt>Paid this month</dt><dd>$8,900.00</dd></div>
    </dl>

    <form role="search" aria-label="Filter invoices">
      <label for="q">Search</label>
      <input id="q" type="search" placeholder="Client or invoice number" />
      <label for="status">Status</label>
      <select id="status">
        <option value="all">All</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
      </select>
    </form>

    <table aria-label="Invoices">
      <thead>
        <tr>
          <th scope="col">Invoice</th>
          <th scope="col">Client</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">INV-1042</th>
          <td>Acme Corp</td>
          <td>$4,200.00</td>
          <td>Overdue</td>
          <td>
            <button type="button" aria-label="View invoice INV-1042">View</button>
            <button type="button" aria-label="Send invoice INV-1042 to client">Send</button>
            <button type="button" aria-label="Delete invoice INV-1042">Delete</button>
          </td>
        </tr>
        <tr>
          <th scope="row">INV-1041</th>
          <td>Northwind Ltd</td>
          <td>$1,800.00</td>
          <td>Paid</td>
          <td>
            <button type="button" aria-label="View invoice INV-1041">View</button>
            <button type="button" aria-label="Send invoice INV-1041 to client">Send</button>
            <button type="button" aria-label="Delete invoice INV-1041">Delete</button>
          </td>
        </tr>
        <tr>
          <th scope="row">INV-1040</th>
          <td>Globex</td>
          <td>$6,400.00</td>
          <td>Draft</td>
          <td>
            <button type="button" aria-label="View invoice INV-1040">View</button>
            <button type="button" aria-label="Send invoice INV-1040 to client">Send</button>
            <button type="button" aria-label="Delete invoice INV-1040">Delete</button>
          </td>
        </tr>
      </tbody>
    </table>

    <form aria-label="Create invoice" method="post">
      <label for="client">Client name</label>
      <input id="client" name="client" required />
      <label for="amount">Amount</label>
      <input id="amount" name="amount" type="number" min="1" required />
      <label for="due">Due date</label>
      <input id="due" name="due" type="date" />
      <button type="submit">Create invoice</button>
    </form>

    <p role="status"></p>
  </section>
</main>
`;

/**
 * Resets the jsdom document to the invoices dashboard. We reuse the global
 * document (rather than createHTMLDocument) because it has a defaultView, which
 * the binder needs for native value setters and event construction.
 */
export function invoiceDocument(): Document {
  return fragmentDocument(INVOICE_HTML, "Invoices — Northstar Billing");
}

/** Loads an arbitrary fragment into the test document. */
export function fragmentDocument(html: string, title = "fixture"): Document {
  document.title = title;
  document.body.innerHTML = html;
  return document;
}
