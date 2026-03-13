/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  FileText, 
  Search,
  ArrowRightLeft,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RowData {
  FACTURA: string;
  FACTURA_DIAN_NORMALIZADA: string;
  FACTURA_HIOPOS_NORMALIZADA: string;
  CUFE_CUDE: string;
  SERIE_NUMERO: string;
  PROVEEDOR_DIAN: string;
  PROVEEDOR_HIOPOS: string;
  FECHA_DIAN: string;
  FECHA_HIOPOS: string;
  TOTAL_DIAN: number;
  TOTAL_HIOPOS: number;
  EN_DIAN: string;
  EN_HIOPOS: string;
  ESTADO: string;
  OBSERVACION: string;
}

export default function App() {
  const [generalRows, setGeneralRows] = useState<RowData[]>([]);
  const [pendientesRows, setPendientesRows] = useState<RowData[]>([]);
  const [hioposNoDianRows, setHioposNoDianRows] = useState<RowData[]>([]);
  const [diferenciasRows, setDiferenciasRows] = useState<RowData[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [activeTab, setActiveTab] = useState<'general' | 'pendientes' | 'hioposNoDian' | 'diferencias'>('general');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [summary, setSummary] = useState({
    totalDian: 0,
    totalHiopos: 0,
    coincidencias: 0,
    pendientesDian: 0,
    pendientesHiopos: 0
  });

  const fileDianRef = useRef<HTMLInputElement>(null);
  const fileHioposRef = useRef<HTMLInputElement>(null);

  // Helper functions
  const cleanText = (val: any) => String(val || "").trim();
  
  const normalizeKey = (value: any) => {
    if (value === null || value === undefined) return "";

    let s = String(value);

    // quitar espacios invisibles y caracteres raros comunes de Excel/copiado
    s = s
      .replace(/\u00A0/g, " ")   // non-breaking space
      .replace(/\u2007/g, " ")
      .replace(/\u202F/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, ""); // zero-width chars

    // normalizar unicode
    s = s.normalize("NFKD");

    // quitar tildes/diacríticos
    s = s.replace(/[\u0300-\u036f]/g, "");

    // mayúsculas
    s = s.toUpperCase();

    // quitar espacios y separadores visibles
    s = s.replace(/\s+/g, "");
    s = s.replace(/[\/\\\-.]/g, "");

    // dejar solo letras y números
    s = s.replace(/[^A-Z0-9]/g, "");

    return s.trim();
  };

  const debugCompare = (rawDian: any, rawHiopos: any) => {
    return {
      rawDian: String(rawDian ?? ""),
      rawHiopos: String(rawHiopos ?? ""),
      normDian: normalizeKey(rawDian),
      normHiopos: normalizeKey(rawHiopos),
      match: normalizeKey(rawDian) === normalizeKey(rawHiopos)
    };
  };

  const parseMoney = (val: any) => {
    if (typeof val === 'number') return val;
    const cleaned = String(val || "0").replace(/[^0-9.-]/g, "");
    return parseFloat(cleaned) || 0;
  };

  const formatExcelDate = (val: any) => {
    if (!val) return "";
    if (typeof val === 'number') {
      const date = XLSX.SSF.parse_date_code(val);
      return `${date.d}/${date.m}/${date.y}`;
    }
    return String(val);
  };

  const money = (val: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(val);
  };

  const pickCol = (firstRow: any, possibleNames: string[]) => {
    if (!firstRow) return null;
    const keys = Object.keys(firstRow);
    for (const name of possibleNames) {
      const found = keys.find(k => k.toLowerCase().trim() === name.toLowerCase().trim());
      if (found) return found;
    }
    return null;
  };

  const readExcelSmart = (file: File): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet);
          resolve(json);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsBinaryString(file);
    });
  };

  const handleCompare = async () => {
    try {
      setMsg("Procesando archivos...");
      setLoading(true);

      const fileDian = fileDianRef.current?.files?.[0];
      const fileHiopos = fileHioposRef.current?.files?.[0];

      if (!fileDian || !fileHiopos) {
        setMsg("⚠️ Debes subir ambos archivos.");
        setLoading(false);
        return;
      }

      const dian = await readExcelSmart(fileDian);
      const hiopos = await readExcelSmart(fileHiopos);

      if (!dian.length || !hiopos.length) {
        setMsg("⚠️ Uno de los archivos no tiene información.");
        setLoading(false);
        return;
      }

      const dCols = {
        factura: pickCol(dian[0], ["Factura"]),
        cufe: pickCol(dian[0], ["CUFE/CUDE", "CUFE", "CUDE"]),
        proveedor: pickCol(dian[0], ["Nombre Emisor"]),
        fecha: pickCol(dian[0], ["Fecha Emisión", "Fecha Emision"]),
        total: pickCol(dian[0], ["Total"])
      };

      const hCols = {
        suDoc: pickCol(hiopos[0], ["Su Doc", "SU DOC"]),
        serieNumero: pickCol(hiopos[0], ["Serie / Número", "Serie / Numero", "Serie / NÃºmero"]),
        proveedor: pickCol(hiopos[0], ["Contacto"]),
        fecha: pickCol(hiopos[0], ["Fecha Doc"]),
        total: pickCol(hiopos[0], ["Neto"]),
        almacen: pickCol(hiopos[0], ["Almacén", "AlmacÃ©n"])
      };

      if (!dCols.factura || !hCols.suDoc) {
        setMsg("❌ No se encontró la columna de Factura (DIAN) o Su Doc (HIOPOS).");
        setLoading(false);
        return;
      }

      // 4) Reemplaza la construcción del mapa HIOPOS por esta
      const hiByColA = new Map();
      const hiRows: any[] = [];

      hiopos.forEach((row: any) => {
        const suDocRaw = cleanText(row[hCols.suDoc!]);
        const key = normalizeKey(suDocRaw);

        if (!key) return;

        const info = {
          factura_hiopos: suDocRaw,
          serie_numero: hCols.serieNumero ? cleanText(row[hCols.serieNumero]) : "",
          proveedor_hiopos: hCols.proveedor ? cleanText(row[hCols.proveedor]) : "",
          fecha_hiopos: hCols.fecha ? formatExcelDate(row[hCols.fecha]) : "",
          total_hiopos: hCols.total ? parseMoney(row[hCols.total]) : 0,
          almacen: hCols.almacen ? cleanText(row[hCols.almacen]) : ""
        };

        hiRows.push(info);

        // importante: guardar por clave normalizada
        if (!hiByColA.has(key)) {
          hiByColA.set(key, info);
        }
      });

      // 5) Reemplaza también la construcción de DIAN por esta
      const dianRows: any[] = [];

      dian.forEach((row: any) => {
        const facturaRaw = cleanText(row[dCols.factura!]);
        const key = normalizeKey(facturaRaw);

        if (!key) return;

        dianRows.push({
          factura_dian: facturaRaw,
          factura_dian_normalizada: key,
          cufe_cude: dCols.cufe ? cleanText(row[dCols.cufe]) : "",
          proveedor_dian: dCols.proveedor ? cleanText(row[dCols.proveedor]) : "",
          fecha_dian: dCols.fecha ? formatExcelDate(row[dCols.fecha]) : "",
          total_dian: dCols.total ? parseMoney(row[dCols.total]) : 0
        });
      });

      // 3) En el cruce A vs A, guarda también los valores normalizados
      const matchedHiKeys = new Set();

      const rowsFromDian: RowData[] = dianRows.map(d => {
        const keyDian = d.factura_dian_normalizada;
        const hi = hiByColA.get(keyDian);
        const existeEnHiopos = !!hi;
        if (existeEnHiopos) matchedHiKeys.add(keyDian);

        const totalDian = d.total_dian;
        const totalHiopos = hi?.total_hiopos || 0;

        let estado = existeEnHiopos ? "INGRESADA" : "PENDIENTE POR INGRESAR";
        let observacion = existeEnHiopos 
          ? "Coincide por columna A normalizada" 
          : "Está en DIAN y no está en HIOPOS";

        if (existeEnHiopos && Math.abs(totalDian - totalHiopos) > 1) {
          estado = "DIFERENCIA DE VALOR";
          observacion = "Revisar diferencia entre DIAN y HIOPOS";
        }

        return {
          FACTURA: d.factura_dian,
          FACTURA_DIAN_NORMALIZADA: keyDian,
          FACTURA_HIOPOS_NORMALIZADA: hi ? normalizeKey(hi.factura_hiopos) : "",
          CUFE_CUDE: d.cufe_cude,
          SERIE_NUMERO: hi?.serie_numero || "",
          PROVEEDOR_DIAN: d.proveedor_dian,
          PROVEEDOR_HIOPOS: hi?.proveedor_hiopos || "",
          FECHA_DIAN: d.fecha_dian,
          FECHA_HIOPOS: hi?.fecha_hiopos || "",
          TOTAL_DIAN: totalDian,
          TOTAL_HIOPOS: totalHiopos,
          EN_DIAN: "SI",
          EN_HIOPOS: existeEnHiopos ? "SI" : "NO",
          ESTADO: estado,
          OBSERVACION: observacion
        };
      });

      const rowsFromHioposOnly: RowData[] = [];
      hiByColA.forEach((h, key) => {
        if (!matchedHiKeys.has(key)) {
          rowsFromHioposOnly.push({
            FACTURA: h.factura_hiopos,
            FACTURA_DIAN_NORMALIZADA: "",
            FACTURA_HIOPOS_NORMALIZADA: key,
            CUFE_CUDE: "",
            SERIE_NUMERO: h.serie_numero || "",
            PROVEEDOR_DIAN: "",
            PROVEEDOR_HIOPOS: h.proveedor_hiopos,
            FECHA_DIAN: "",
            FECHA_HIOPOS: h.fecha_hiopos,
            TOTAL_DIAN: 0,
            TOTAL_HIOPOS: h.total_hiopos,
            EN_DIAN: "NO",
            EN_HIOPOS: "SI",
            ESTADO: "INGRESADA EN HIOPOS Y NO REGISTRADA EN DIAN",
            OBSERVACION: "Está en HIOPOS y no está en DIAN"
          });
        }
      });

      const rows = [...rowsFromDian, ...rowsFromHioposOnly];

      // Validación de control
      const dianKeysSet = new Set(dianRows.map(r => r.factura_dian_normalizada).filter(Boolean));
      const hiKeysSet = new Set(Array.from(hiByColA.keys()).filter(Boolean));
      const coincidencias = [...dianKeysSet].filter(k => hiKeysSet.has(k));

      if (coincidencias.length === 0) {
        setMsg("⚠️ Los archivos cargados no tienen coincidencias entre DIAN columna A (Factura) y HIOPOS columna A (Su Doc). Revisa si corresponden al mismo periodo, sede o tipo de documento.");
        setGeneralRows([]);
        setPendientesRows([]);
        setHioposNoDianRows([]);
        setDiferenciasRows([]);
        setSummary({
          totalDian: dianRows.length,
          totalHiopos: hiByColA.size,
          coincidencias: 0,
          pendientesDian: dianRows.length,
          pendientesHiopos: hiByColA.size
        });
        setLoading(false);
        return;
      }

      setGeneralRows(rows);
      const pRows = rows.filter(r => r.ESTADO === "PENDIENTE POR INGRESAR");
      const hndRows = rows.filter(r => r.ESTADO === "INGRESADA EN HIOPOS Y NO REGISTRADA EN DIAN");
      const dRows = rows.filter(r => r.ESTADO === "DIFERENCIA DE VALOR");

      setPendientesRows(pRows);
      setHioposNoDianRows(hndRows);
      setDiferenciasRows(dRows);

      setSummary({
        totalDian: dianRows.length,
        totalHiopos: hiByColA.size,
        coincidencias: coincidencias.length,
        pendientesDian: pRows.length,
        pendientesHiopos: hndRows.length
      });

      setMsg("✅ Cruce realizado correctamente.");
      setLoading(false);
    } catch (error) {
      console.error(error);
      setMsg("❌ Error procesando archivos.");
      setLoading(false);
    }
  };

  const handleDownloadAll = () => {
    if (!generalRows.length) {
      setMsg("✅ No hay información para descargar.");
      return;
    }

    const wb = XLSX.utils.book_new();

    const wsGeneral = XLSX.utils.json_to_sheet(generalRows);
    XLSX.utils.book_append_sheet(wb, wsGeneral, "GENERAL");

    const wsPendientes = XLSX.utils.json_to_sheet(pendientesRows);
    XLSX.utils.book_append_sheet(wb, wsPendientes, "PENDIENTES");

    const wsHioposNoDian = XLSX.utils.json_to_sheet(hioposNoDianRows);
    XLSX.utils.book_append_sheet(wb, wsHioposNoDian, "HIOPOS_NO_DIAN");

    const wsDiferencias = XLSX.utils.json_to_sheet(diferenciasRows);
    XLSX.utils.book_append_sheet(wb, wsDiferencias, "DIFERENCIAS");

    XLSX.writeFile(wb, "Cruce_DIAN_vs_HIOPOS.xlsx");
  };

  const handleDownloadPendientes = () => {
    if (!pendientesRows.length) {
      setMsg("✅ No hay pendientes para descargar.");
      return;
    }

    const pendientes = pendientesRows.map(r => ({
      FACTURA: r.FACTURA,
      CUFE_CUDE: r.CUFE_CUDE,
      SERIE_NUMERO: r.SERIE_NUMERO,
      PROVEEDOR_DIAN: r.PROVEEDOR_DIAN,
      PROVEEDOR_HIOPOS: r.PROVEEDOR_HIOPOS,
      FECHA_DIAN: r.FECHA_DIAN,
      FECHA_HIOPOS: r.FECHA_HIOPOS,
      TOTAL_DIAN: r.TOTAL_DIAN,
      TOTAL_HIOPOS: r.TOTAL_HIOPOS,
      EN_DIAN: r.EN_DIAN,
      EN_HIOPOS: r.EN_HIOPOS,
      ESTADO: r.ESTADO,
      OBSERVACION: r.OBSERVACION
    }));

    const wb = XLSX.utils.book_new();
    const wsPendientes = XLSX.utils.json_to_sheet(pendientes);
    XLSX.utils.book_append_sheet(wb, wsPendientes, "PENDIENTES");
    XLSX.writeFile(wb, "Pendientes_por_ingresar_a_HIOPOS.xlsx");
  };

  const renderTable = (data: RowData[]) => {
    return (
      <div className="overflow-x-auto border border-zinc-200 rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 font-medium uppercase tracking-wider text-[10px]">
            <tr>
              <th className="px-4 py-3">Factura</th>
              <th className="px-4 py-3">Serie / Número</th>
              <th className="px-4 py-3">Proveedor DIAN</th>
              <th className="px-4 py-3">Proveedor HIOPOS</th>
              <th className="px-4 py-3">Fecha DIAN</th>
              <th className="px-4 py-3">Fecha HIOPOS</th>
              <th className="px-4 py-3">Total DIAN</th>
              <th className="px-4 py-3">Total HIOPOS</th>
              <th className="px-4 py-3">DIAN</th>
              <th className="px-4 py-3">HIOPOS</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Observación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {data.map((r, i) => (
              <tr key={i} className="hover:bg-zinc-50 transition-colors">
                <td className="px-4 py-3 font-medium text-zinc-900">{r.FACTURA}</td>
                <td className="px-4 py-3 text-zinc-600">{r.SERIE_NUMERO}</td>
                <td className="px-4 py-3 text-zinc-600">{r.PROVEEDOR_DIAN}</td>
                <td className="px-4 py-3 text-zinc-600">{r.PROVEEDOR_HIOPOS}</td>
                <td className="px-4 py-3 text-zinc-500">{r.FECHA_DIAN}</td>
                <td className="px-4 py-3 text-zinc-500">{r.FECHA_HIOPOS}</td>
                <td className="px-4 py-3 font-mono text-right">{money(r.TOTAL_DIAN)}</td>
                <td className="px-4 py-3 font-mono text-right">{money(r.TOTAL_HIOPOS)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.EN_DIAN === 'SI' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                    {r.EN_DIAN}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${r.EN_HIOPOS === 'SI' ? 'bg-emerald-100 text-emerald-700' : 'bg-zinc-100 text-zinc-400'}`}>
                    {r.EN_HIOPOS}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded text-[11px] font-semibold ${
                    r.ESTADO === 'INGRESADA' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 
                    r.ESTADO === 'DIFERENCIA DE VALOR' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                    'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    {r.ESTADO}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500 italic text-xs">{r.OBSERVACION}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-zinc-400 italic">
                  No hay datos para mostrar
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F9F9F8] text-zinc-900 font-sans p-6 md:p-10">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200 pb-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-600 font-mono text-xs uppercase tracking-widest font-bold">
              <ArrowRightLeft size={14} />
              <span>Conciliación Fiscal</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-serif italic font-light tracking-tight">
              DIAN <span className="text-zinc-400 font-sans not-italic text-2xl mx-2">vs</span> HIOPOS
            </h1>
            <p className="text-zinc-500 max-w-md text-sm">
              Cruce inteligente de facturación electrónica y registros de punto de venta.
            </p>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={handleDownloadAll}
              disabled={generalRows.length === 0}
              className="flex items-center gap-2 bg-zinc-900 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-zinc-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-zinc-200"
            >
              <Download size={16} />
              Descargar Todo
            </button>
            <button 
              onClick={handleDownloadPendientes}
              disabled={pendientesRows.length === 0}
              className="flex items-center gap-2 border border-zinc-200 bg-white text-zinc-700 px-5 py-2.5 rounded-full text-sm font-medium hover:bg-zinc-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Clock size={16} />
              Solo Pendientes
            </button>
          </div>
        </header>

        {/* Upload Section */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-800">Archivo DIAN</h3>
                <p className="text-xs text-zinc-400">Excel exportado de la DIAN</p>
              </div>
            </div>
            <label className="block w-full cursor-pointer group">
              <div className="border-2 border-dashed border-zinc-200 rounded-xl p-8 flex flex-col items-center justify-center gap-2 group-hover:border-emerald-300 group-hover:bg-emerald-50/30 transition-all">
                <Upload size={24} className="text-zinc-300 group-hover:text-emerald-400 transition-colors" />
                <span className="text-sm text-zinc-500 group-hover:text-emerald-600">Seleccionar archivo</span>
                <input type="file" ref={fileDianRef} accept=".xlsx,.xls" className="hidden" />
              </div>
            </label>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <FileSpreadsheet size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-zinc-800">Archivo HIOPOS</h3>
                <p className="text-xs text-zinc-400">Excel exportado de HIOPOS</p>
              </div>
            </div>
            <label className="block w-full cursor-pointer group">
              <div className="border-2 border-dashed border-zinc-200 rounded-xl p-8 flex flex-col items-center justify-center gap-2 group-hover:border-blue-300 group-hover:bg-blue-50/30 transition-all">
                <Upload size={24} className="text-zinc-300 group-hover:text-blue-400 transition-colors" />
                <span className="text-sm text-zinc-500 group-hover:text-blue-600">Seleccionar archivo</span>
                <input type="file" ref={fileHioposRef} accept=".xlsx,.xls" className="hidden" />
              </div>
            </label>
          </div>
        </section>

        {/* Action Button */}
        <div className="flex flex-col items-center gap-4">
          <button 
            onClick={handleCompare}
            disabled={loading}
            className="w-full max-w-md bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-3 disabled:opacity-70"
          >
            {loading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Search size={24} />
            )}
            {loading ? "Procesando..." : "Realizar Cruce"}
          </button>
          
          {msg && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${
                msg.includes('✅') ? 'bg-emerald-50 text-emerald-700' : 
                msg.includes('⚠️') ? 'bg-amber-50 text-amber-700' : 
                'bg-rose-50 text-rose-700'
              }`}
            >
              {msg.includes('✅') ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {msg}
            </motion.div>
          )}
        </div>

        {/* Stats Summary */}
        {(summary.totalDian > 0 || summary.totalHiopos > 0) && (
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mb-1">Total DIAN</p>
              <p className="text-3xl font-serif italic">{summary.totalDian}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 mb-1">Total HIOPOS</p>
              <p className="text-3xl font-serif italic">{summary.totalHiopos}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest font-bold text-emerald-400 mb-1">Coincidencias</p>
              <p className={`text-3xl font-serif italic ${summary.coincidencias === 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {summary.coincidencias}
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest font-bold text-rose-400 mb-1">Pend. DIAN</p>
              <p className="text-3xl font-serif italic text-rose-600">{summary.pendientesDian}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest font-bold text-amber-400 mb-1">Pend. HIOPOS</p>
              <p className="text-3xl font-serif italic text-amber-600">{summary.pendientesHiopos}</p>
            </div>
          </section>
        )}

        {/* Tabs & Results */}
        {generalRows.length > 0 && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex border-b border-zinc-200 overflow-x-auto no-scrollbar flex-1">
                <button 
                  onClick={() => setActiveTab('general')}
                  className={`px-6 py-3 text-sm font-medium transition-all relative whitespace-nowrap ${activeTab === 'general' ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  General
                  {activeTab === 'general' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />}
                </button>
                <button 
                  onClick={() => setActiveTab('pendientes')}
                  className={`px-6 py-3 text-sm font-medium transition-all relative whitespace-nowrap ${activeTab === 'pendientes' ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Pendientes ({pendientesRows.length})
                  {activeTab === 'pendientes' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />}
                </button>
                <button 
                  onClick={() => setActiveTab('hioposNoDian')}
                  className={`px-6 py-3 text-sm font-medium transition-all relative whitespace-nowrap ${activeTab === 'hioposNoDian' ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  HIOPOS no DIAN ({hioposNoDianRows.length})
                  {activeTab === 'hioposNoDian' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />}
                </button>
                <button 
                  onClick={() => setActiveTab('diferencias')}
                  className={`px-6 py-3 text-sm font-medium transition-all relative whitespace-nowrap ${activeTab === 'diferencias' ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  Diferencias ({diferenciasRows.length})
                  {activeTab === 'diferencias' && <motion.div layoutId="tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />}
                </button>
              </div>

              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input 
                  type="text"
                  placeholder="Buscar factura o proveedor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab + searchTerm}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
              >
                {(() => {
                  const filterData = (data: RowData[]) => {
                    if (!searchTerm) return data;
                    const s = searchTerm.toLowerCase();
                    return data.filter(r => 
                      r.FACTURA.toLowerCase().includes(s) || 
                      r.PROVEEDOR_DIAN.toLowerCase().includes(s) || 
                      r.PROVEEDOR_HIOPOS.toLowerCase().includes(s) ||
                      r.CUFE_CUDE.toLowerCase().includes(s)
                    );
                  };

                  if (activeTab === 'general') return renderTable(filterData(generalRows));
                  if (activeTab === 'pendientes') return renderTable(filterData(pendientesRows));
                  if (activeTab === 'hioposNoDian') return renderTable(filterData(hioposNoDianRows));
                  if (activeTab === 'diferencias') return renderTable(filterData(diferenciasRows));
                  return null;
                })()}
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* Empty State */}
        {generalRows.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-zinc-300 space-y-4">
            <FileText size={64} strokeWidth={1} />
            <p className="text-lg font-serif italic text-zinc-400">Sube los archivos para comenzar el análisis</p>
          </div>
        )}

      </div>
      
      {/* Footer */}
      <footer className="max-w-7xl mx-auto mt-20 pt-8 border-t border-zinc-200 flex justify-between items-center text-[10px] uppercase tracking-widest font-bold text-zinc-400">
        <span>Conciliador v2.0</span>
        <span>Rocoto &copy; 2026</span>
      </footer>
    </div>
  );
}
