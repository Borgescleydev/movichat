"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  updatedAt: string;
  assignedTo?: { id: string; name: string };
}

interface Column {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  order: number;
  contacts: Contact[];
}

interface KanbanBoardProps {
  userRole: string;
}

export default function KanbanBoard({ userRole }: KanbanBoardProps) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewContact, setShowNewContact] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const isAdmin = ["superadmin", "admin"].includes(userRole);

  useEffect(() => {
    loadColumns();
  }, []);

  async function loadColumns() {
    const res = await fetch("/api/pipeline");
    const data = await res.json();
    setColumns(data);
    setLoading(false);
  }

  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const targetColumnId = destination.droppableId;

    // Optimistic update
    setColumns((prev) => {
      const newCols = prev.map((col) => ({
        ...col,
        contacts: col.contacts.filter((c) => c.id !== draggableId),
      }));
      const contact = prev.flatMap((c) => c.contacts).find((c) => c.id === draggableId);
      if (!contact) return prev;

      return newCols.map((col) => {
        if (col.id === targetColumnId) {
          const newContacts = [...col.contacts];
          newContacts.splice(destination.index, 0, contact);
          return { ...col, contacts: newContacts };
        }
        return col;
      });
    });

    await fetch(`/api/contacts/${draggableId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId: targetColumnId }),
    });
  }

  async function createContact(columnId: string) {
    if (!newContactName || !newContactPhone) return;
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newContactName, phone: newContactPhone, columnId }),
    });
    if (res.ok) {
      setNewContactName("");
      setNewContactPhone("");
      setShowNewContact(null);
      loadColumns();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-full">
        {columns.map((col) => (
          <div key={col.id} className="flex-shrink-0 w-72">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col max-h-[calc(100vh-200px)]">
              {/* Column header */}
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: col.color }} />
                  <h3 className="font-semibold text-gray-900 text-sm">{col.name}</h3>
                  {col.isDefault && (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">padrão</span>
                  )}
                </div>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {col.contacts.length}
                </span>
              </div>

              {/* Contacts */}
              <Droppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`flex-1 overflow-y-auto p-3 space-y-2 min-h-[100px] transition-colors ${
                      snapshot.isDraggingOver ? "bg-green-50" : ""
                    }`}
                  >
                    {col.contacts.map((contact, index) => (
                      <Draggable key={contact.id} draggableId={contact.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`bg-white border border-gray-200 rounded-lg p-3 cursor-grab shadow-sm hover:shadow-md transition-shadow ${
                              snapshot.isDragging ? "shadow-lg rotate-2 opacity-90" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700">
                                  {contact.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-900 leading-tight">{contact.name}</p>
                                  <p className="text-xs text-gray-500">{contact.phone}</p>
                                </div>
                              </div>
                              <a
                                href={`/conversations?contact=${contact.id}`}
                                className="text-green-600 hover:text-green-700"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                              </a>
                            </div>
                            {contact.assignedTo && (
                              <p className="text-xs text-gray-400 mt-2">Responsável: {contact.assignedTo.name}</p>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>

              {/* Add contact */}
              {showNewContact === col.id ? (
                <div className="p-3 border-t border-gray-100 space-y-2">
                  <input
                    autoFocus
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Nome do contato"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <input
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Telefone (ex: 5511999999999)"
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => createContact(col.id)}
                      className="flex-1 bg-green-600 text-white text-sm py-1.5 rounded hover:bg-green-700 transition-colors"
                    >
                      Adicionar
                    </button>
                    <button
                      onClick={() => setShowNewContact(null)}
                      className="flex-1 border border-gray-200 text-gray-600 text-sm py-1.5 rounded hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewContact(col.id)}
                  className="m-3 flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors border border-dashed border-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar contato
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Add column button */}
        {isAdmin && <AddColumnButton onAdd={loadColumns} />}
      </div>
    </DragDropContext>
  );
}

function AddColumnButton({ onAdd }: { onAdd: () => void }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");

  async function handleAdd() {
    if (!name) return;
    await fetch("/api/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });
    setName("");
    setColor("#6366f1");
    setShow(false);
    onAdd();
  }

  if (show) {
    return (
      <div className="flex-shrink-0 w-72 bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">Nova coluna</h3>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da coluna"
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Cor:</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleAdd} className="flex-1 bg-green-600 text-white text-sm py-2 rounded hover:bg-green-700 transition-colors">
            Criar
          </button>
          <button onClick={() => setShow(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm py-2 rounded hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShow(true)}
      className="flex-shrink-0 w-72 h-20 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 hover:text-gray-600 hover:border-gray-300 flex items-center justify-center gap-2 text-sm transition-colors"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Nova coluna
    </button>
  );
}
