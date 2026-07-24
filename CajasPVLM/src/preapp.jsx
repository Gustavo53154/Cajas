import React, { useEffect, useState } from 'react';

const App = () => {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetch('/data/horario.txt')
      .then((response) => response.text())
      .then((text) => {
        const lines = text.split('\n');
        const parsedData = lines.map((line) => {
          const [apellidos, nombres, puesto, ...horarios] = line.split(',');
          return { apellidos, nombres, puesto, horarios };
        });
        setData(parsedData);
      })
      .catch((error) => console.error('Error al leer el archivo:', error));
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      const now = new Date();
      const currentDayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
      const currentTime = now.toTimeString().slice(0, 5);

      const filtered = data.filter(({ horarios }) => {
        const entrada = horarios[currentDayIndex * 2];
        const salida = horarios[currentDayIndex * 2 + 1];
        if (entrada === 'DESCANSO' || salida === 'DESCANSO') return false;
        return currentTime >= entrada && currentTime <= salida;
      });
      setFilteredData(filtered);
    }
  }, [data]);

  const toggleStatus = (caja) => {
    setAssignments((prev) => ({
      ...prev,
      [caja]: { ...prev[caja], active: !prev[caja]?.active },
    }));
  };

  const assignToCaja = (nombre, horario) => {
    const caja = prompt("Seleccione la caja (SELF, CR1, CR2, ..., C18):");
    if (caja) {
      setAssignments((prev) => ({
        ...prev,
        [caja]: { nombre, horario, active: true },
      }));
    }
  };

  const removeAssignment = (caja) => {
    setAssignments((prev) => {
      const newAssignments = { ...prev };
      delete newAssignments[caja];
      return newAssignments;
    });
  };

  const assignTask = (task) => {
    const caja = prompt("Ingrese la caja del personal para esta tarea:");
    if (caja) {
      setTasks((prev) => [...prev, { task, caja }]);
    }
  };

  const cajas = ['SELF', 'CR1', 'CR2', 'CR3', ...Array.from({ length: 18 }, (_, i) => `C${i + 1}`)];

  return (
    <div className="p-4">
      <h1 className="text-center text-xl font-bold mb-4">NO ASIGNADOS</h1>
      <table className="table-auto w-full border border-gray-300 mb-6">
        <thead>
          <tr className="bg-gray-200">
            <th className="border border-gray-300 px-6 py-2">Horario</th>
            <th className="border-l-4 border-gray-500 px-6 py-2">Nombre Completo</th>
            <th className="border border-gray-300 px-4 py-2">Acción</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map(({ apellidos, nombres, horarios }, index) => {
            const now = new Date();
            const dayIndex = (now.getDay() === 0 ? 6 : now.getDay() - 1) * 2;
            const entrada = horarios[dayIndex];
            const salida = horarios[dayIndex + 1];
            return (
              <tr key={index} className="hover:bg-gray-100">
                <td className="border border-gray-300 px-6 py-2">{`${entrada} - ${salida}`}</td>
                <td className="border-l-4 border-gray-500 px-6 py-2">{`${apellidos}, ${nombres}`}</td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  <button
                    className="bg-blue-500 text-white px-4 py-1 rounded hover:bg-blue-600"
                    onClick={() => assignToCaja(`${apellidos}, ${nombres}`, `${entrada} - ${salida}`)}
                  >
                    Asignar
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h1 className="text-center text-xl font-bold mb-4">ASIGNACIÓN DE CAJAS</h1>
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
          {cajas.map((caja) => (
            <tr key={caja} className={assignments[caja]?.active ? "" : "bg-gray-300"}>
              <td>
                <button
                  className={`px-4 py-1 rounded ${assignments[caja]?.active ? "bg-green-500" : "bg-red-500"}`}
                  onClick={() => toggleStatus(caja)}
                >
                  {assignments[caja]?.active ? "On" : "Off"}
                </button>
              </td>
              <td>{caja}</td>
              <td>{assignments[caja]?.nombre || ""}</td>
              <td></td>
              <td>{assignments[caja]?.horario || ""}</td>
              <td>
                <button
                  className="bg-red-500 text-white px-4 py-1 rounded"
                  onClick={() => removeAssignment(caja)}
                >
                  Retirar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h1 className="text-center text-xl font-bold mb-4">TAREAS ASIGNADAS</h1>
      <table className="table-auto w-full border border-gray-300">
        <thead>
          <tr className="bg-gray-200">
            <th>Tarea</th>
            <th>Caja Asignada</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(({ task, caja }, index) => (
            <tr key={index}>
              <td>{task}</td>
              <td>{caja}</td>
              <td>
                <button className="bg-blue-500 text-white px-4 py-1 rounded" onClick={() => assignTask(task)}>Asignar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default App;
