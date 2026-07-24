import React, { useEffect, useState } from 'react';

const App = () => {
  const [data, setData] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [taskAssignments, setTaskAssignments] = useState([]);

  const cajas = ["SELF", "CR1", "CR2", "CR3", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15", "C16", "C17", "C18"];
  const tasks = ["Coches", "Devoluciones", "Bolsas", "Cajas de Agua", "Limpieza de Cajas"];

  useEffect(() => {
    fetch('/data/horario.txt')
      .then(response => response.text())
      .then(text => {
        const lines = text.split('\n');
        const parsedData = lines.map(line => {
          const [nombre, horario] = line.split(',');
          return { nombre, horario };
        });
        setUnassigned(parsedData);
      })
      .catch(error => console.error('Error al leer el archivo:', error));
  }, []);

  const assignToCaja = (nombre, horario) => {
    const caja = prompt("Ingrese la caja a la que desea asignar:");
    if (caja && cajas.includes(caja)) {
      setAssignments(prev => ({ ...prev, [caja]: { nombre, horario } }));
      setUnassigned(prev => prev.filter(person => person.nombre !== nombre));
    }
  };

  const toggleCaja = (caja) => {
    setAssignments(prev => ({
      ...prev,
      [caja]: { ...prev[caja], active: !prev[caja]?.active }
    }));
  };

  const removeFromCaja = (caja) => {
    if (assignments[caja]) {
      setUnassigned(prev => [...prev, assignments[caja]]);
      setAssignments(prev => {
        const updated = { ...prev };
        delete updated[caja];
        return updated;
      });
    }
  };

  const assignTask = (task) => {
    const caja = prompt("Ingrese la caja del personal para esta tarea:");
    if (caja && assignments[caja]) {
      setTaskAssignments(prev => [...prev, { task, caja, ...assignments[caja] }]);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-center text-xl font-bold mb-4">Gestión de Personal</h1>
      
      {/* Tabla de No Asignados */}
      <h2 className="text-lg font-semibold">No Asignados</h2>
      <table className="table-auto w-full border border-gray-300">
        <thead>
          <tr className="bg-gray-200">
            <th>Nombre</th>
            <th>Horario</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {unassigned.map((person, index) => (
            <tr key={index}>
              <td>{person.nombre}</td>
              <td>{person.horario}</td>
              <td>
                <button className="bg-blue-500 text-white px-4 py-1 rounded" onClick={() => assignToCaja(person.nombre, person.horario)}>Asignar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Tabla de Asignación de Cajas */}
      <h2 className="text-lg font-semibold mt-6">Asignación de Cajas</h2>
      <table className="table-auto w-full border border-gray-300">
        <thead>
          <tr className="bg-gray-200">
            <th>On/Off</th>
            <th>Caja</th>
            <th>Nombre Completo</th>
            <th>Tarea Secundaria</th>
            <th>Horario</th>
            <th>Retirar</th>
          </tr>
        </thead>
        <tbody>
          {cajas.map((caja, index) => (
            <tr key={index} className={assignments[caja]?.active ? "" : "bg-gray-300"}>
              <td>
                <button className={`px-4 py-1 rounded ${assignments[caja]?.active ? 'bg-green-500' : 'bg-red-500'}`} onClick={() => toggleCaja(caja)}>
                  {assignments[caja]?.active ? "On" : "Off"}
                </button>
              </td>
              <td>{caja}</td>
              <td>{assignments[caja]?.nombre || ""}</td>
              <td>{assignments[caja]?.tarea || ""}</td>
              <td>{assignments[caja]?.horario || ""}</td>
              <td>
                <button className="bg-red-500 text-white px-4 py-1 rounded" onClick={() => removeFromCaja(caja)}>Retirar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Tabla de Asignación de Tareas */}
      <h2 className="text-lg font-semibold mt-6">Asignación de Tareas</h2>
      <table className="table-auto w-full border border-gray-300">
        <thead>
          <tr className="bg-gray-200">
            <th>Tarea</th>
            <th>Asignados</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => (
            <React.Fragment key={index}>
              <tr>
                <td colSpan={2}><strong>{task}</strong></td>
                <td>
                  <button className="bg-blue-500 text-white px-4 py-1 rounded" onClick={() => assignTask(task)}>Asignar</button>
                </td>
              </tr>
              {taskAssignments.filter(t => t.task === task).map((t, i) => (
                <tr key={i}>
                  <td></td>
                  <td>{t.nombre} ({t.caja}) - {t.horario}</td>
                  <td>
                    <button className="bg-red-500 text-white px-4 py-1 rounded" onClick={() => setTaskAssignments(prev => prev.filter(p => p !== t))}>Retirar</button>
                  </td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default App;
