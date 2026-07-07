import { FormConfig } from '../types';

// Preset form schemas offered from the form builder's "Choose a template"
// step when starting a brand-new form. Ported verbatim from
// Collector-Web/form-templates.js (same FormConfig shape, validated by
// docs/form-builder-spec.md) so both native and web get the same starting
// points, not just the website.
export type FormTemplate = {
  key: string;
  label: string;
  schema: FormConfig;
};

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    key: 'erwtimatologio-simiou',
    label: 'Ερωτηματολόγιο Σημείου Προσβασιμότητας',
    schema: {
      formId: 'erwtimatologio-simiou',
      formTitle: 'Ερωτηματολόγιο Σημείου Προσβασιμότητας',
      version: '1.0',
      sections: [
        { id: 'A', title: 'ΤΜΗΜΑ Α — Γενικά στοιχεία σημείου' },
        { id: 'B', title: 'ΤΜΗΜΑ Β — Κτίριο / Δημόσιος χώρος' },
        { id: 'G', title: 'ΤΜΗΜΑ Γ — Θέση στάθμευσης ΑΜΕΑ' },
        { id: 'E', title: 'ΤΜΗΜΑ Ε — Άλλο σημείο' },
      ],
      fields: [
        { id: 'recordedDate', label: 'Ημερομηνία καταγραφής', type: 'date', required: true, auto: true, sectionId: 'A' },
        { id: 'placeName', label: 'Ονομασία χώρου / σημείου', type: 'text', required: true, placeholder: 'π.χ. Δημαρχείο, ΚΕΠ, ΑΤΜ, Πλατεία, Θέση Στάθμευσης ΑΜΕΑ κ.λ.', sectionId: 'A' },
        { id: 'address', label: 'Διεύθυνση / Τοπόσημο', type: 'text', placeholder: 'Διεύθυνση ή τοπόσημο…', sectionId: 'A' },
        { id: 'location', label: 'Γεωγραφικό στίγμα (GPS)', type: 'gps', required: true, sectionId: 'A' },
        {
          id: 'category', label: 'Κατηγορία σημείου', type: 'select', required: true,
          options: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος', 'Θέση Στάθμευσης ΑΜΕΑ', 'Άλλο'],
          sectionId: 'A',
        },
        {
          id: 'b1_access_to_entrance', label: 'Β1. Υπάρχει δυνατότητα πρόσβασης ΑΜΕΑ μέχρι την είσοδο του χώρου;', type: 'select', required: true,
          options: ['Ναι', 'Μερικώς', 'Όχι', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b2_movement_within', label: 'Β2. Υπάρχει δυνατότητα κίνησης / εξυπηρέτησης ΑΜΕΑ εντός του χώρου;', type: 'select', required: true,
          options: ['Ναι', 'Μερικώς', 'Όχι', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b3_access_infrastructure', label: 'Β3. Τι είδους υποδομή πρόσβασης υπάρχει;', type: 'select',
          options: ['Ράμπα εισόδου / εξόδου', 'Διαβάσεις', 'Αναβατόριο', 'Οδηγός τυφλών / οδεύσεις τυφλών', 'Προσβάσιμη είσοδος χωρίς προσωρινή διαφορά', 'Προσβάσιμος διάδρομος κυκλοφορίας'],
          multiple: true, allowOther: true,
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b4_height_differences', label: 'Β4. Υπάρχουν υψομετρικές διαφορές που επηρεάζουν την πρόσβαση;', type: 'select', required: true,
          options: ['Όχι', 'Ναι — εξυπηρετούνται επαρκώς', 'Ναι — εξυπηρετούνται μερικώς', 'Ναι — δεν εξυπηρετούνται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b4b_height_difference_solution', label: 'Τρόπος εξυπηρέτησης υψομετρικών διαφορών', type: 'select',
          options: ['Ράμπα', 'Διαβάσεις', 'Αναβατόριο', 'Δεν εφαρμόζεται'],
          multiple: true, allowOther: true,
          sectionId: 'B', showIf: { fieldId: 'b4_height_differences', equals: ['Ναι — εξυπηρετούνται επαρκώς', 'Ναι — εξυπηρετούνται μερικώς', 'Ναι — δεν εξυπηρετούνται'] },
        },
        {
          id: 'b5_infra_condition', label: 'Β5. Κατάσταση υποδομών προσβασιμότητας', type: 'select', required: true,
          options: ['Άριστη — λειτουργούν πλήρως', 'Ελαφρώς φθαρμένες — λειτουργούν με μικρά προβλήματα', 'Φθαρμένα/ικές — δυσλειτουργούν ή είναι επικίνδυνες', 'Εκτός λειτουργίας', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b6_turning_space', label: 'Β6. Υπάρχει ελεύθερος χώρος διαμέτρου τουλάχιστον 1,50 μ. για περιστροφή αμαξιδίου;', type: 'select', required: true,
          options: ['Ναι', 'Μερικώς', 'Όχι', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b7_corridors', label: 'Β7. Οι διάδρομοι κυκλοφορίας είναι κατάλληλοι για κίνηση ΑΜΕΑ;', type: 'select', required: true,
          options: ['Ναι — επαρκείς', 'Μερικώς — οριακοί / με μικρά εμπόδια', 'Όχι — ανεπαρκείς / με σημαντικά εμπόδια', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b8_toilets', label: 'Β8. Υπάρχουν προσβάσιμες τουαλέτες ΑΜΕΑ;', type: 'select', required: true,
          options: ['Ναι — λειτουργούν', 'Ναι — αλλά εκτός λειτουργίας / κλειστές', 'Όχι', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b9_changing_rooms', label: 'Β9. Υπάρχουν αποδυτήρια ΑΜΕΑ;', type: 'select', required: true,
          options: ['Ναι — λειτουργούν', 'Ναι — αλλά εκτός λειτουργίας / μη διαθέσιμα', 'Όχι', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b10_signage', label: 'Β10. Υπάρχει πληροφόρηση / σήμανση ΑΜΕΑ;', type: 'select', required: true,
          options: ['Ναι — επαρκής', 'Ναι — μερική / ανεπαρκής', 'Όχι', 'Δεν εφαρμόζεται'],
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'b10b_signage_type', label: 'Είδος πληροφόρησης / σήμανσης', type: 'select',
          options: ['Πινακίδες / κατευθυντήρια σήμανση', 'Σήμανση προσβάσιμης εισόδου', 'Σήμανση ράμπας', 'Σήμανση ανελκυστήρα', 'Σήμανση WC ΑΜΕΑ', 'Braille / ανάγλυφη σήμανση', 'Ηχητική πληροφόρηση', 'Ψηφιακή πληροφόρηση / QR / εφαρμογή / ιστοσελίδα'],
          multiple: true, allowOther: true,
          sectionId: 'B', showIf: { fieldId: 'b10_signage', equals: ['Ναι — επαρκής', 'Ναι — μερική / ανεπαρκής'] },
        },
        {
          id: 'b12_notes', label: 'Β12. Παρατηρήσεις για κτίριο / δημόσιο χώρο', type: 'textarea', placeholder: 'Παρατηρήσεις…',
          sectionId: 'B', showIf: { fieldId: 'category', equals: ['Κτίριο', 'Δημόσιος / κοινόχρηστος χώρος'] },
        },
        {
          id: 'd1_horizontal_marking', label: 'Γ1. Οριζόντια σήμανση θέσης ΑΜΕΑ στο οδόστρωμα', type: 'select', required: true,
          options: ['Ναι — ευδιάκριτη', 'Ναι — φθαρμένη / δυσδιάκριτη', 'Όχι'],
          sectionId: 'G', showIf: { fieldId: 'category', equals: 'Θέση Στάθμευσης ΑΜΕΑ' },
        },
        {
          id: 'd1b_vertical_sign', label: 'Κάθετη πινακίδα ΑΜΕΑ', type: 'select', required: true,
          options: ['Ναι — ευδιάκριτη', 'Ναι — φθαρμένη / δυσδιάκριτη', 'Όχι'],
          sectionId: 'G', showIf: { fieldId: 'category', equals: 'Θέση Στάθμευσης ΑΜΕΑ' },
        },
        {
          id: 'd2_dimensions', label: 'Γ2. Διαστάσεις θέσης (≥ 3,50 μ. πλάτος)', type: 'select', required: true,
          options: ['Επαρκείς', 'Ανεπαρκείς', 'Δεν μπόρεσα να εκτιμήσω'],
          sectionId: 'G', showIf: { fieldId: 'category', equals: 'Θέση Στάθμευσης ΑΜΕΑ' },
        },
        {
          id: 'd3_sidewalk_connection', label: 'Γ3. Υπάρχει σύνδεση με προσβάσιμο πεζοδρόμιο ή προσβάσιμη διαδρομή;', type: 'select', required: true,
          options: ['Ναι — άμεση πρόσβαση', 'Υπάρχει πρόσβαση με μικρές δυσκολίες', 'Υπάρχει εμπόδιο', 'π.χ. κράσπεδο χωρίς κατέβασμα', 'Όχι'],
          sectionId: 'G', showIf: { fieldId: 'category', equals: 'Θέση Στάθμευσης ΑΜΕΑ' },
        },
        {
          id: 'e1_description', label: 'Ε1. Περιγραφή σημείου', type: 'textarea', required: true, placeholder: 'Περιγραφή σημείου…',
          sectionId: 'E', showIf: { fieldId: 'category', equals: 'Άλλο' },
        },
        {
          id: 'e2_relation_to_accessibility', label: 'Ε2. Σχέση σημείου με προσβασιμότητα ΑΜΕΑ', type: 'textarea', placeholder: 'Σχέση με προσβασιμότητα…',
          sectionId: 'E', showIf: { fieldId: 'category', equals: 'Άλλο' },
        },
        {
          id: 'e3_condition_notes', label: 'Ε3. Κατάσταση και παρατηρήσεις', type: 'textarea', placeholder: 'Κατάσταση και παρατηρήσεις…',
          sectionId: 'E', showIf: { fieldId: 'category', equals: 'Άλλο' },
        },
        { id: 'photos', label: 'Φωτογραφίες', type: 'image', multiple: true },
      ],
    },
  },
];
