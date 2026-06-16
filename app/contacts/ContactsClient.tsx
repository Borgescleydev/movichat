"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  updatedAt: string;
  assignedTo?: { id: string; name: string };
  messages: { body: string; timestamp: string }[];
}

export default function ContactsClient({ userRole }: { userRole: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });

  const isAdmin = ["superadmin", "admin"].includes(userRole);

  useEffect(() => {
    loadContacts();
  }, [search]);

  async function loadContacts() {
    setLoading(true);
    const res = await fetch(`/api/contacts?search=${encodeURIComponent(search)}`);
    const data = await res.json();
    setContacts(data);
    setLoading(false);
  }

  async function createContact(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowNew(false);
      setForm({ name: "", phone: "", email: "" });
      loadContacts();
    }
  }

  async function deleteContact(id: string) {
    if (!confirm("Excluir este contato?")) return;
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    loadContacts();
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Contato
        </button>
      </div>

      {/* New contact modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Novo Contato</h2>
            <form onSubmit={createContact} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone * (ex: 5511999999999)</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 transition-colors font-medium">
                  Criar Contato
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contacts table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <p>Nenhum contato encontrado</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Contato</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Última mensagem</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700">
                        {contact.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                        {contact.email && <p className="text-xs text-gray-400">{contact.email}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{contact.phone}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {contact.messages[0]?.body || <span className="text-gray-300">Sem mensagens</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      <Link
                        href={`/conversations?contact=${contact.id}`}
                        className="text-green-600 hover:text-green-700 text-xs font-medium"
                      >
                        Conversar
                      </Link>
                      {isAdmin && (
                        <button
                          onClick={() => deleteContact(contact.id)}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
