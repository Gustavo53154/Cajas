from datetime import datetime, timedelta

archivo_personal = "personal.txt"
archivo_horarios = "horario.txt"

COMANDOS_SALIDA = ["+", "++", "*", "**", "***", "."]

def cargar_personal(archivo):
    personal = []
    with open(archivo, "r") as archivo:
        for linea in archivo:
            personal.append(linea.strip().split(","))
    return personal

def cargar_horarios(archivo):
    horarios = {}
    with open(archivo, "r") as archivo:
        for linea in archivo:
            datos = linea.strip().split(",")
            horarios[(datos[0], datos[1])] = datos[2:]
    return horarios

def formatear_hora(hora):
    hora_str = str(hora)

    if not hora_str.isdigit():
        raise ValueError(f"Hora inválida: {hora_str}")

    if len(hora_str) <= 2:
        hora_str = hora_str.zfill(2) + ":00"
    elif len(hora_str) == 3:
        hora_str = "0" + hora_str[0] + ":" + hora_str[1:]
    elif len(hora_str) == 4:
        hora_str = hora_str[:2] + ":" + hora_str[2:]

    return hora_str

def sumar_duracion(entrada, duracion):
    formato = "%H:%M"
    entrada_dt = datetime.strptime(entrada, formato)
    duracion_td = timedelta(hours=duracion[0], minutes=duracion[1])
    salida_dt = entrada_dt + duracion_td
    return salida_dt.strftime(formato)

def interpretar_salida(salida, entrada):
    comandos_duracion = {"*": (3, 45), "**": (8, 0), "***": (9, 0)}
    
    if salida in comandos_duracion:
        return sumar_duracion(entrada, comandos_duracion[salida])
    elif salida == ".":
        return "DESCANSO"
    elif salida.isdigit():
        return formatear_hora(salida)
    else:
        print("Salida inválida.")
        return None

def registrar_horario_por_categoria(categoria, personal):
    personal_categoria = [p for p in personal if p[2].lower() == categoria.lower()]
    
    if not personal_categoria:
        print(f"No se encontró personal en la categoría '{categoria}'.")
        return

    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

    for persona in personal_categoria:
        apellidos, nombres, cargo = persona

        if (apellidos, nombres) in horarios_existentes:
            print(f"{nombres} {apellidos} ya tiene horario registrado. Saltando.")
            continue

        horario = [apellidos, nombres, cargo]
        jornada_duracion = None
        dia_index = 0
        completo = True

        while dia_index < len(dias):
            dia = dias[dia_index]

            entrada = input(f"Ingrese entrada {nombres} {apellidos} ({dia}): ")

            # COMANDOS DE CONTROL
            if entrada == "/":
                if dia_index > 0:
                    dia_index -= 1
                    horario = horario[:-2]
                else:
                    print("No se puede retroceder más.")
                continue

            elif entrada == "//":
                print("Reiniciando semana.")
                horario = [apellidos, nombres, cargo]
                jornada_duracion = None
                dia_index = 0
                continue

            elif entrada == "..":
                print("Cancelado.")
                completo = False
                break

            elif entrada == ".":
                horario.extend(["DESCANSO", "DESCANSO"])
                dia_index += 1
                continue

            # VALIDAR ENTRADA
            if not entrada.isdigit():
                print("Entrada inválida. Use números (ej: 645, 9, 16).")
                continue

            entrada_formateada = formatear_hora(entrada)

            # PEDIR SALIDA
            if not jornada_duracion:
                salida = input(f"Ingrese salida ({dia}): ")

                if salida == "+":
                    jornada_duracion = (4, 30)
                    salida_formateada = sumar_duracion(entrada_formateada, jornada_duracion)

                elif salida == "++":
                    jornada_duracion = (9, 0)
                    salida_formateada = sumar_duracion(entrada_formateada, jornada_duracion)

                else:
                    salida_formateada = interpretar_salida(salida, entrada_formateada)

                    if salida_formateada is None:
                        continue
            else:
                salida_formateada = sumar_duracion(entrada_formateada, jornada_duracion)

            horario.extend([entrada_formateada, salida_formateada])
            dia_index += 1

        if completo:
            with open(archivo_horarios, "a") as archivo:
                archivo.write(",".join(horario) + "\n")
            print(f"Horario registrado para {nombres} {apellidos}")
        else:
            print("Horario no guardado.")

def registrar_horario_manualmente(personal):
    while True:
        apellido = input("Apellido (0 para salir): ").strip()
        if apellido == "0":
            return

        for persona in personal:
            apellidos, nombres, cargo = persona

            if apellidos.lower() == apellido.lower():

                horario = [apellidos, nombres, cargo]
                jornada_duracion = None
                dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
                dia_index = 0

                while dia_index < len(dias):
                    dia = dias[dia_index]

                    entrada = input(f"Entrada {dia}: ")

                    if entrada == "/":
                        if dia_index > 0:
                            dia_index -= 1
                            horario = horario[:-2]
                        continue

                    elif entrada == "//":
                        horario = [apellidos, nombres, cargo]
                        jornada_duracion = None
                        dia_index = 0
                        continue

                    elif entrada == "..":
                        return

                    elif entrada == ".":
                        horario.extend(["DESCANSO", "DESCANSO"])
                        dia_index += 1
                        continue

                    if not entrada.isdigit():
                        print("Entrada inválida.")
                        continue

                    entrada_formateada = formatear_hora(entrada)

                    if not jornada_duracion:
                        salida = input("Salida: ")

                        if salida == "+":
                            jornada_duracion = (4, 30)
                            salida_formateada = sumar_duracion(entrada_formateada, jornada_duracion)

                        elif salida == "++":
                            jornada_duracion = (9, 0)
                            salida_formateada = sumar_duracion(entrada_formateada, jornada_duracion)

                        else:
                            salida_formateada = interpretar_salida(salida, entrada_formateada)
                            if salida_formateada is None:
                                continue
                    else:
                        salida_formateada = sumar_duracion(entrada_formateada, jornada_duracion)

                    horario.extend([entrada_formateada, salida_formateada])
                    dia_index += 1

                with open(archivo_horarios, "a") as archivo:
                    archivo.write(",".join(horario) + "\n")

                print("Horario guardado.")
                return

        print("Persona no encontrada.")

def main():
    global horarios_existentes

    personal = cargar_personal(archivo_personal)
    horarios_existentes = cargar_horarios(archivo_horarios)

    while True:
        print("\n1. Self Checkout\n2. RS\n3. Cajer@\n4. Ecommerce\n5. Supervisor(@)\n6. Manual\n7. Salir")

        opcion = input("Opción: ")

        if opcion == "1":
            registrar_horario_por_categoria("Self Checkout", personal)
        elif opcion == "2":
            registrar_horario_por_categoria("RS", personal)
        elif opcion == "3":
            registrar_horario_por_categoria("Cajer@", personal)
        elif opcion == "4":
            registrar_horario_por_categoria("Ecommerce", personal)
        elif opcion == "5":
            registrar_horario_por_categoria("Supervisor(@)", personal)
        elif opcion == "6":
            registrar_horario_manualmente(personal)
        elif opcion == "7":
            break
        else:
            print("Opción inválida.")

if __name__ == "__main__":
    main()