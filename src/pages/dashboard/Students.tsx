<label className="relative btn-secondary flex items-center gap-1.5 text-sm cursor-pointer overflow-hidden">
  <Upload size={16} />
  Importer

  <input
    type="file"
    accept=".csv,.xlsx,.xls,.docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
    onChange={handleFileSelect}
  />
</label>