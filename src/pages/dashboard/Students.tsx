<label className="btn-secondary flex items-center gap-1.5 text-sm cursor-pointer">
  <Upload size={16} />
  Importer

  <input
    type="file"
    accept=".csv,.xlsx,.xls,.docx,.pdf"
    className="hidden"
    onChange={handleFileSelect}
  />
</label>